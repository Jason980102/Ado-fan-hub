"""Opt-in, one-shot product restock notifications through Expo Push Service."""
import json
import logging
import os
import re
import sqlite3
import threading
import time
import uuid
from urllib.request import Request, build_opener

from fastapi import APIRouter, Header, HTTPException, Request as ApiRequest
from pydantic import BaseModel, Field

from fx_rates import NoRedirect
from shop_campaigns import campaign_info
from shop_state import authenticated, connect, secret_hash
from shop_stock import active_entries, stock_snapshot

router = APIRouter(prefix='/api/push', tags=['Restock notifications'])
log = logging.getLogger(__name__)
IDENTIFIER = r'^[A-Za-z0-9_-]{1,80}$'


def push_enabled():
    project = os.environ.get('EXPO_PUSH_PROJECT_ID', '')
    return os.environ.get('PUSH_ENABLED') == '1' and bool(re.fullmatch(r'[0-9a-fA-F-]{36}', project))


@router.get('/config')
def config():
    return {'enabled': push_enabled(), 'projectId': os.environ.get('EXPO_PUSH_PROJECT_ID') if push_enabled() else None,
            'scope': 'product', 'oneShot': True}


def require_enabled():
    if not push_enabled():
        raise HTTPException(503, 'Restock notifications are not enabled')


def credentials(device_id, authorization):
    if not re.fullmatch(r'[0-9a-fA-F-]{36}', device_id):
        raise HTTPException(400, 'Invalid device identifier')
    secret = authorization.removeprefix('Bearer ') if authorization.startswith('Bearer ') else ''
    if not re.fullmatch(r'[0-9a-f]{64}', secret):
        raise HTTPException(401, 'Device authentication required')
    return secret


def rate_limit(conn, key, maximum):
    now = time.time()
    row = conn.execute('SELECT * FROM push_api_limits WHERE key=?', (key,)).fetchone()
    if row and now - row['start'] < 3600:
        if row['count'] >= maximum:
            raise HTTPException(429, 'Too many notification changes', headers={'Retry-After': '3600'})
        conn.execute('UPDATE push_api_limits SET count=count+1 WHERE key=?', (key,))
    else:
        conn.execute('INSERT INTO push_api_limits VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET start=excluded.start,count=1', (key, now))
    conn.execute('DELETE FROM push_api_limits WHERE start<?', (now - 7200,))


class DeviceInput(BaseModel):
    token: str = Field(pattern=r'^(ExpoPushToken|ExponentPushToken)\[[A-Za-z0-9_-]{10,200}\]$')
    language: str = Field(default='zh', pattern=r'^(zh|en|ja)$')


@router.put('/devices/{device_id}')
def register_device(device_id: str, body: DeviceInput, request: ApiRequest, authorization: str = Header(default='')):
    require_enabled()
    secret = credentials(device_id, authorization)
    try:
        with connect() as conn:
            conn.execute('BEGIN IMMEDIATE')
            rate_limit(conn, 'ip:' + secret_hash(request.client.host if request.client else 'unknown'), 30)
            existing = conn.execute('SELECT * FROM push_devices WHERE id=?', (device_id,)).fetchone()
            if existing and not authenticated(conn, device_id, secret):
                raise HTTPException(401, 'Device authentication failed')
            if not existing and conn.execute('SELECT count(*) FROM push_devices').fetchone()[0] >= 50000:
                raise HTTPException(503, 'Notification registration temporarily unavailable')
            conn.execute('INSERT INTO push_devices(id,secret_hash,token,language) VALUES(?,?,?,?) '
                         'ON CONFLICT(id) DO UPDATE SET token=excluded.token,language=excluded.language,active=1',
                         (device_id, secret_hash(secret), body.token, body.language))
    except sqlite3.IntegrityError:
        raise HTTPException(409, 'Notification token already registered') from None
    return {'registered': True}


@router.get('/devices/{device_id}/subscriptions')
def subscriptions(device_id: str, authorization: str = Header(default='')):
    secret = credentials(device_id, authorization)
    with connect() as conn:
        device = authenticated(conn, device_id, secret)
        if not device:
            raise HTTPException(401, 'Device authentication failed')
        rows = conn.execute('SELECT theme,product FROM restock_subscriptions WHERE device_id=?', (device_id,)).fetchall()
    return {'subscriptions': [{'themeSlug': r['theme'], 'productSlug': r['product']}
                              for r in rows if device['active'] and campaign_info(r['theme'])['wishlist_eligible']]}


@router.delete('/devices/{device_id}')
def unregister_device(device_id: str, authorization: str = Header(default='')):
    secret = credentials(device_id, authorization)
    with connect() as conn:
        if not authenticated(conn, device_id, secret):
            raise HTTPException(401, 'Device authentication failed')
        deactivate(conn, device_id)
    return {'registered': False}


class SubscriptionInput(BaseModel):
    themeSlug: str = Field(pattern=IDENTIFIER)
    productSlug: str = Field(pattern=IDENTIFIER)
    enabled: bool


@router.put('/devices/{device_id}/subscriptions')
def set_subscription(device_id: str, body: SubscriptionInput, authorization: str = Header(default='')):
    secret = credentials(device_id, authorization)
    # Authenticate before doing any potentially slow catalogue lookup.
    with connect() as conn:
        if not authenticated(conn, device_id, secret):
            raise HTTPException(401, 'Device authentication failed')
    if body.enabled:
        require_enabled()
        snapshot = stock_snapshot()
        if snapshot['stale']:
            raise HTTPException(503, 'Fresh stock data unavailable')
        match = next((entry for entry in active_entries(snapshot)
                      if entry['theme']['slug'] == body.themeSlug and entry['product']['slug'] == body.productSlug), None)
        if not match or match['product']['status'] != 'sold_out':
            raise HTTPException(409, 'Only current sold-out products can be subscribed')
    with connect() as conn:
        conn.execute('BEGIN IMMEDIATE')
        device = authenticated(conn, device_id, secret)
        if not device or (body.enabled and not device['active']):
            raise HTTPException(401, 'Device registration required')
        rate_limit(conn, 'device:' + device_id, 120)
        params = (device_id, body.themeSlug, body.productSlug)
        if body.enabled:
            if not campaign_info(body.themeSlug)['wishlist_eligible']:
                raise HTTPException(409, 'Campaign ended')
            if conn.execute('SELECT count(*) FROM restock_subscriptions WHERE device_id=?', (device_id,)).fetchone()[0] >= 100:
                raise HTTPException(409, 'Notification subscription limit reached')
            exists = conn.execute('SELECT 1 FROM restock_subscriptions WHERE device_id=? AND theme=? AND product=?', params).fetchone()
            if not exists:
                conn.execute('DELETE FROM restock_jobs WHERE device_id=? AND theme=? AND product=?', params)
                conn.execute('INSERT INTO restock_subscriptions VALUES(?,?,?)', params)
        else:
            conn.execute('DELETE FROM restock_subscriptions WHERE device_id=? AND theme=? AND product=?', params)
            conn.execute("UPDATE restock_jobs SET state='cancelled' WHERE device_id=? AND theme=? AND product=? AND state='pending'", params)
    return {'enabled': body.enabled}


def expo_post(route, payload):
    headers = {'Accept': 'application/json', 'Content-Type': 'application/json'}
    access = os.environ.get('EXPO_ACCESS_TOKEN')
    if access:
        headers['Authorization'] = 'Bearer ' + access
    request = Request('https://exp.host/--/api/v2/push/' + route,
                      data=json.dumps(payload).encode(), headers=headers, method='POST')
    with build_opener(NoRedirect()).open(request, timeout=10) as response:
        body = response.read(2_000_001)
    if len(body) > 2_000_000:
        raise ValueError('Push response too large')
    result = json.loads(body)
    if result.get('errors') or not isinstance(result.get('data'), (list, dict)):
        raise ValueError('Push service rejected request')
    return result['data']


def deactivate(conn, device_id):
    conn.execute('UPDATE push_devices SET active=0 WHERE id=?', (device_id,))
    conn.execute('DELETE FROM restock_subscriptions WHERE device_id=?', (device_id,))
    conn.execute("UPDATE restock_jobs SET state='cancelled' WHERE device_id=? AND state='pending'", (device_id,))


def notification(job):
    lang = job['language']
    title = {'zh': '周邊補貨通知', 'en': 'Merchandise back in stock', 'ja': 'グッズ再入荷のお知らせ'}[lang]
    suffix = {'zh': '已有庫存，請至官方網站確認規格與庫存。',
              'en': ' is available again. Check sizes and stock at the official shop.',
              'ja': 'が再入荷しました。仕様と在庫は公式サイトでご確認ください。'}[lang]
    return {'to': job['token'], 'title': title, 'body': job['title'][:120] + suffix,
            'sound': 'default', 'channelId': 'restock', 'ttl': 3600,
            'data': {'type': 'restock', 'themeSlug': job['theme'], 'productSlug': job['product'],
                     'eventId': str(job['id']), 'url': '/shop'}}


def deliver_pending(sender=expo_post):
    now = time.time()
    with connect() as conn:
        jobs = [dict(r) for r in conn.execute("""SELECT j.*, d.token,d.language FROM restock_jobs j
            JOIN push_devices d ON d.id=j.device_id JOIN restock_subscriptions s
            ON s.device_id=j.device_id AND s.theme=j.theme AND s.product=j.product
            WHERE j.state='pending' AND j.next_attempt<=? AND d.active=1 ORDER BY j.id LIMIT 100""", (now,))]
    jobs = [j for j in jobs if campaign_info(j['theme'])['wishlist_eligible']]
    if not jobs:
        return
    # Recheck current observations before retrying an earlier availability event.
    snapshot = stock_snapshot()
    if snapshot['stale']:
        return
    available = {(e['theme']['slug'], e['product']['slug']) for e in active_entries(snapshot)
                 if e['product']['status'] == 'available'}
    jobs = [j for j in jobs if (j['theme'], j['product']) in available]
    if not jobs:
        return
    try:
        tickets = sender('send', [notification(job) for job in jobs])
        if not isinstance(tickets, list) or len(tickets) != len(jobs):
            raise ValueError('Invalid push tickets')
    except Exception:
        # A transport timeout is ambiguous; retries may rarely duplicate delivery.
        tickets = [{'status': 'error'} for _ in jobs]
        log.warning('Restock push request failed; retry scheduled')
    with connect() as conn:
        for job, ticket in zip(jobs, tickets):
            if not isinstance(ticket, dict):
                ticket = {'status': 'error'}
            if ticket.get('status') == 'ok' and isinstance(ticket.get('id'), str):
                conn.execute("UPDATE restock_jobs SET state='submitted',ticket=?,next_attempt=? WHERE id=?", (ticket['id'], now + 900, job['id']))
            elif (ticket.get('details') or {}).get('error') == 'DeviceNotRegistered':
                deactivate(conn, job['device_id'])
                conn.execute("UPDATE restock_jobs SET state='failed' WHERE id=?", (job['id'],))
            else:
                attempts = job['attempts'] + 1
                conn.execute('UPDATE restock_jobs SET state=?,attempts=?,next_attempt=? WHERE id=?',
                             ('failed' if attempts >= 8 else 'pending', attempts,
                              now + min(3600, 60 * 2 ** attempts), job['id']))
                if attempts >= 8:
                    conn.execute('DELETE FROM restock_subscriptions WHERE device_id=? AND theme=? AND product=?',
                                 (job['device_id'], job['theme'], job['product']))


def check_receipts(sender=expo_post):
    now = time.time()
    with connect() as conn:
        jobs = [dict(r) for r in conn.execute("SELECT * FROM restock_jobs WHERE state='submitted' AND next_attempt<=? LIMIT 100", (now,))]
    if not jobs:
        return
    try:
        receipts = sender('getReceipts', {'ids': [j['ticket'] for j in jobs]})
        if not isinstance(receipts, dict):
            raise ValueError('Invalid push receipts')
    except Exception:
        log.warning('Restock receipt check failed')
        return
    with connect() as conn:
        for job in jobs:
            receipt = receipts.get(job['ticket'])
            if receipt is None and now - job['created'] < 86400:
                conn.execute('UPDATE restock_jobs SET next_attempt=? WHERE id=?', (now + 300, job['id']))
                continue
            state = 'delivered' if receipt and receipt.get('status') == 'ok' else 'failed'
            conn.execute('UPDATE restock_jobs SET state=? WHERE id=?', (state, job['id']))
            conn.execute('DELETE FROM restock_subscriptions WHERE device_id=? AND theme=? AND product=?',
                         (job['device_id'], job['theme'], job['product']))
            if receipt and (receipt.get('details') or {}).get('error') == 'DeviceNotRegistered':
                deactivate(conn, job['device_id'])


def run_monitor(sender=expo_post):
    if not push_enabled():
        return
    owner, now = uuid.uuid4().hex, time.time()
    with connect() as conn:
        claimed = conn.execute('UPDATE shop_worker SET owner=?,lease_until=? WHERE id=1 AND lease_until<=? AND next_run<=?',
                               (owner, now + 120, now, now)).rowcount
    if not claimed:
        return
    try:
        with connect() as conn:
            themes = [r[0] for r in conn.execute('SELECT DISTINCT theme FROM restock_subscriptions')]
            for theme in themes:
                if not campaign_info(theme)['wishlist_eligible']:
                    conn.execute('DELETE FROM restock_subscriptions WHERE theme=?', (theme,))
                    conn.execute("UPDATE restock_jobs SET state='cancelled' WHERE theme=? AND state='pending'", (theme,))
            count = conn.execute('SELECT count(*) FROM restock_subscriptions').fetchone()[0]
        if count:
            snapshot = stock_snapshot()
            if not snapshot['stale']:
                with connect() as conn:
                    for entry in active_entries(snapshot):
                        if entry['product']['status'] == 'available':
                            conn.execute('''INSERT OR IGNORE INTO restock_jobs(device_id,theme,product,title,created)
                                SELECT device_id,theme,product,?,? FROM restock_subscriptions WHERE theme=? AND product=?''',
                                (entry['product']['title'], time.time(), entry['theme']['slug'], entry['product']['slug']))
        # Renew after catalogue I/O and verify ownership before sending anything.
        with connect() as conn:
            owned = conn.execute('UPDATE shop_worker SET lease_until=? WHERE id=1 AND owner=? AND lease_until>?',
                                 (time.time() + 120, owner, time.time())).rowcount
        if owned:
            deliver_pending(sender)
            check_receipts(sender)
    finally:
        with connect() as conn:
            conn.execute('UPDATE shop_worker SET next_run=?,lease_until=0,owner=NULL WHERE id=1 AND owner=?', (time.time() + 60, owner))


class RestockWorker:
    def __init__(self):
        self.stop_event = threading.Event()
        self.thread = threading.Thread(target=self.run, name='restock-monitor', daemon=True)

    def start(self):
        self.thread.start()

    def run(self):
        while not self.stop_event.wait(60):
            try:
                run_monitor()
            except Exception:
                log.warning('Restock monitor failed; will retry')

    def stop(self):
        self.stop_event.set()
        self.thread.join(timeout=12)
