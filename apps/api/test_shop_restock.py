import json
import os
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import Mock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

import shop_catalog
import shop_push
import shop_stock
from shop_state import connect


def theme():
    return {'id': 1, 'slug': 'Pusheen', 'title': 'Pusheen', 'image_url': None,
            'visual_kind': 'none', 'url': shop_catalog.OFFICIAL + '/shops/Pusheen',
            'campaign_status': 'active', 'wishlist_eligible': True,
            'campaign_ends_at': '2026-10-27T00:00:00+09:00', 'campaign_source_url': None}


def product(slug='item', status='sold_out'):
    return {'slug': slug, 'title': 'Test merchandise', 'price_jpy': 1000,
            'image_url': None, 'status': status, 'labels': [],
            'url': shop_catalog.OFFICIAL + '/products/' + slug}


class RestockTests(unittest.TestCase):
    device = '12345678-1234-1234-1234-123456789012'
    secret = 'a' * 64

    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        env = patch.dict(os.environ, {'SHOP_DB_PATH': str(Path(temp.name) / 'shop.sqlite3'),
                                     'PUSH_ENABLED': '1', 'EXPO_PUSH_PROJECT_ID': self.device})
        env.start()
        self.addCleanup(env.stop)
        self.snapshot = {'items': [{'theme': theme(), 'product': product()}], 'stale': False,
                         'checked_at': '2026-10-18T12:00:00Z', 'source': 'test', 'cached': False}
        stock_patch = patch('shop_push.stock_snapshot', side_effect=lambda: self.snapshot)
        self.stock = stock_patch.start()
        self.addCleanup(stock_patch.stop)
        info_patch = patch('shop_push.campaign_info', return_value={'wishlist_eligible': True})
        self.info = info_patch.start()
        self.addCleanup(info_patch.stop)
        self.active = patch('shop_push.active_entries', side_effect=lambda snapshot: snapshot['items'])
        self.active.start()
        self.addCleanup(self.active.stop)
        app = FastAPI()
        app.include_router(shop_push.router)
        app.include_router(shop_stock.router)
        self.client = TestClient(app)
        self.addCleanup(self.client.close)
        self.headers = {'Authorization': 'Bearer ' + self.secret}

    def register(self):
        result = self.client.put('/api/push/devices/' + self.device,
                                 json={'token': 'ExpoPushToken[abcdefghijklmnop1234]', 'language': 'zh'}, headers=self.headers)
        self.assertEqual(result.status_code, 200, result.text)

    def subscribe(self, enabled=True):
        return self.client.put('/api/push/devices/' + self.device + '/subscriptions',
                               json={'themeSlug': 'Pusheen', 'productSlug': 'item', 'enabled': enabled}, headers=self.headers)

    def list_subscriptions(self):
        result = self.client.get('/api/push/devices/' + self.device + '/subscriptions', headers=self.headers)
        self.assertEqual(result.status_code, 200)
        return result.json()['subscriptions']

    def force_monitor_due(self):
        with connect() as conn:
            conn.execute('UPDATE shop_worker SET next_run=0')

    def test_not_configured_cannot_claim_success(self):
        with patch.dict(os.environ, {'PUSH_ENABLED': '0'}):
            self.assertFalse(self.client.get('/api/push/config').json()['enabled'])
            self.assertEqual(self.client.put('/api/push/devices/' + self.device,
                             json={'token': 'ExpoPushToken[abcdefghijklmnop1234]'}, headers=self.headers).status_code, 503)
            sender = Mock()
            shop_push.run_monitor(sender)
            sender.assert_not_called()

    def test_authentication_and_duplicate_token_protection(self):
        self.register()
        self.assertEqual(self.subscribe().status_code, 200)
        wrong = {'Authorization': 'Bearer ' + 'b' * 64}
        self.assertEqual(self.client.get('/api/push/devices/' + self.device + '/subscriptions', headers=wrong).status_code, 401)
        other = self.device[:-1] + '3'
        response = self.client.put('/api/push/devices/' + other,
                                   json={'token': 'ExpoPushToken[abcdefghijklmnop1234]'}, headers=self.headers)
        self.assertEqual(response.status_code, 409)

    def test_idempotent_subscribe_and_no_initial_notification(self):
        self.register()
        self.assertEqual(self.subscribe().status_code, 200)
        self.assertEqual(self.subscribe().status_code, 200)
        self.assertEqual(len(self.list_subscriptions()), 1)
        sender = Mock()
        shop_push.run_monitor(sender)
        sender.assert_not_called()

    def test_restocks_once_and_checks_receipt(self):
        self.register()
        self.subscribe()
        self.snapshot['items'][0]['product']['status'] = 'available'
        sender = Mock(return_value=[{'status': 'ok', 'id': 'test-ticket'}])
        shop_push.run_monitor(sender)
        self.assertEqual(sender.call_count, 1)
        self.assertEqual(sender.call_args.args[0], 'send')
        message = sender.call_args.args[1][0]
        self.assertEqual(message['data']['themeSlug'], 'Pusheen')
        self.assertEqual(message['channelId'], 'restock')
        self.force_monitor_due()
        shop_push.run_monitor(sender)
        self.assertEqual(sender.call_count, 1, 'submitted job must not resend')
        with connect() as conn:
            conn.execute('UPDATE restock_jobs SET next_attempt=0')
        receipts = Mock(return_value={'test-ticket': {'status': 'ok'}})
        shop_push.check_receipts(receipts)
        self.assertEqual(self.list_subscriptions(), [])
        with connect() as conn:
            self.assertEqual(conn.execute('SELECT state FROM restock_jobs').fetchone()[0], 'delivered')

    def test_stale_or_missing_product_does_not_notify(self):
        self.register()
        self.subscribe()
        self.snapshot['items'][0]['product']['status'] = 'available'
        self.snapshot['stale'] = True
        sender = Mock()
        shop_push.run_monitor(sender)
        self.snapshot['stale'] = False
        self.snapshot['items'] = []
        self.force_monitor_due()
        shop_push.run_monitor(sender)
        sender.assert_not_called()

    def test_ended_campaign_cancels_without_push(self):
        self.register()
        self.subscribe()
        self.info.return_value = {'wishlist_eligible': False}
        sender = Mock()
        shop_push.run_monitor(sender)
        sender.assert_not_called()
        self.assertEqual(self.list_subscriptions(), [])

    def test_unsubscribe_prevents_pending_send(self):
        self.register()
        self.subscribe()
        with connect() as conn:
            conn.execute("INSERT INTO restock_jobs(device_id,theme,product,title,created) VALUES(?, 'Pusheen','item','Test',0)", (self.device,))
        self.assertEqual(self.subscribe(False).status_code, 200)
        self.snapshot['items'][0]['product']['status'] = 'available'
        sender = Mock()
        shop_push.run_monitor(sender)
        sender.assert_not_called()

    def test_unregistered_token_is_disabled(self):
        self.register()
        self.subscribe()
        self.snapshot['items'][0]['product']['status'] = 'available'
        shop_push.run_monitor(Mock(return_value=[{'status': 'error', 'details': {'error': 'DeviceNotRegistered'}}]))
        self.assertEqual(self.list_subscriptions(), [])
        with connect() as conn:
            self.assertEqual(conn.execute('SELECT active FROM push_devices').fetchone()[0], 0)

    def test_revoked_permission_unregisters_and_cancels_subscriptions(self):
        self.register()
        self.subscribe()
        response = self.client.delete('/api/push/devices/' + self.device, headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()['registered'])
        self.assertEqual(self.list_subscriptions(), [])
        self.snapshot['items'][0]['product']['status'] = 'available'
        sender = Mock()
        shop_push.run_monitor(sender)
        sender.assert_not_called()

    def test_successful_registration_rate_limit_is_enforced(self):
        for _ in range(30):
            self.register()
        response = self.client.put('/api/push/devices/' + self.device,
                                  json={'token': 'ExpoPushToken[abcdefghijklmnop1234]'}, headers=self.headers)
        self.assertEqual(response.status_code, 429)

    def test_transient_failure_is_backed_off_and_can_recover(self):
        self.register()
        self.subscribe()
        self.snapshot['items'][0]['product']['status'] = 'available'
        sender = Mock(side_effect=OSError('simulated offline'))
        with self.assertLogs('shop_push', level='WARNING'):
            shop_push.run_monitor(sender)
        self.force_monitor_due()
        shop_push.run_monitor(sender)
        self.assertEqual(sender.call_count, 1)
        with connect() as conn:
            conn.execute('UPDATE restock_jobs SET next_attempt=0')
        self.force_monitor_due()
        success = Mock(return_value=[{'status': 'ok', 'id': 'ticket'}])
        shop_push.run_monitor(success)
        self.assertEqual(success.call_count, 1)

    def test_receipt_device_error_disables_future_notifications(self):
        self.register()
        self.subscribe()
        self.snapshot['items'][0]['product']['status'] = 'available'
        shop_push.run_monitor(Mock(return_value=[{'status': 'ok', 'id': 'ticket'}]))
        with connect() as conn:
            conn.execute('UPDATE restock_jobs SET next_attempt=0')
        shop_push.check_receipts(Mock(return_value={'ticket': {'status': 'error', 'details': {'error': 'DeviceNotRegistered'}}}))
        self.assertEqual(self.list_subscriptions(), [])

    def test_no_subscriptions_means_no_upstream_fetch(self):
        sender = Mock()
        shop_push.run_monitor(sender)
        self.stock.assert_not_called()
        sender.assert_not_called()

    def test_only_fresh_current_sold_out_products_can_be_subscribed(self):
        self.register()
        self.snapshot['stale'] = True
        self.assertEqual(self.subscribe().status_code, 503)
        self.snapshot['stale'] = False
        self.snapshot['items'][0]['product']['status'] = 'available'
        self.assertEqual(self.subscribe().status_code, 409)

    def test_removed_theme_retained_in_history(self):
        data = {'themes': [theme()], 'checked_at': '2026-10-18T12:00:00Z', 'stale': False, 'cached': False}
        with patch('shop_catalog.cached', return_value=data):
            self.assertEqual(shop_catalog.themes()['themes'][0]['slug'], 'Pusheen')
        with patch('shop_catalog.cached', return_value={**data, 'themes': []}), patch('shop_catalog.campaign_info', return_value={
                'campaign_status': 'ended', 'wishlist_eligible': False, 'campaign_ends_at': '2026-10-27T00:00:00+09:00', 'campaign_source_url': None}):
            result = shop_catalog.themes()['themes']
            self.assertEqual(len(result), 1)
            self.assertEqual(result[0]['campaign_status'], 'ended')
            self.assertEqual(result[0]['title'], 'Pusheen')

    def test_campaign_status_independent_of_official_listing(self):
        result = self.client.get('/api/shop/campaign-status?slugs=Pusheen,Unknown')
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()['campaigns'][1]['campaign_status'], 'unverified')
        self.assertEqual(self.client.get('/api/shop/campaign-status?slugs=bad!').status_code, 400)

    def test_all_pages_loaded_once_and_sold_out_paginated(self):
        shop_stock._snapshot, shop_stock._expires = None, 0
        self.addCleanup(setattr, shop_stock, '_snapshot', None)
        self.addCleanup(setattr, shop_stock, '_expires', 0)
        def page(slug, number):
            return {'theme': theme(), 'products': [product(str(i)) for i in range((number - 1) * 24, min(number * 24, 30))],
                    'has_more': number == 1, 'stale': False}
        with patch('shop_stock.shop_catalog.themes', return_value={'themes': [theme()], 'stale': False}), \
             patch('shop_stock.shop_catalog.products', side_effect=page) as fetch, \
             patch('shop_stock.campaign_info', return_value={'wishlist_eligible': True}):
            first = self.client.get('/api/shop/sold-out?page=1').json()
            second = self.client.get('/api/shop/sold-out?page=2').json()
            self.assertEqual(len(first['items']), 24)
            self.assertEqual(len(second['items']), 6)
            self.assertEqual(fetch.call_count, 2)
            self.assertFalse(second['has_more'])
            with patch('shop_stock.campaign_info', return_value={'wishlist_eligible': False}):
                self.assertEqual(self.client.get('/api/shop/sold-out?page=1').json()['items'], [])

    def test_nested_cache_does_not_extend_source_freshness(self):
        shop_stock._snapshot, shop_stock._expires = None, 0
        self.addCleanup(setattr, shop_stock, '_snapshot', None)
        self.addCleanup(setattr, shop_stock, '_expires', 0)
        old = (datetime.now(timezone.utc) - timedelta(seconds=50)).isoformat()
        with patch('shop_stock.monotonic', return_value=1000), \
             patch('shop_stock.shop_catalog.themes', return_value={'themes': [theme()], 'stale': False, 'checked_at': old}), \
             patch('shop_stock.shop_catalog.products', return_value={'theme': theme(), 'products': [product()], 'has_more': False, 'stale': False, 'checked_at': old}):
            result = shop_stock.stock_snapshot()
        self.assertEqual(result['checked_at'], old)
        self.assertLessEqual(shop_stock._expires, 1010)


if __name__ == '__main__':
    unittest.main()
