"""Durable shop history and opt-in subscriptions on a single deployment host."""
import hashlib
import hmac
import json
import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path


@contextmanager
def connect():
    path = Path(os.environ.get('SHOP_DB_PATH') or Path(__file__).resolve().parent / 'data' / 'shop-state.sqlite3')
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, timeout=10)
    conn.row_factory = sqlite3.Row
    try:
        conn.executescript('''
            CREATE TABLE IF NOT EXISTS theme_history(slug TEXT PRIMARY KEY, payload TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS push_devices(
                id TEXT PRIMARY KEY, secret_hash TEXT NOT NULL, token TEXT UNIQUE NOT NULL,
                language TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1);
            CREATE TABLE IF NOT EXISTS restock_subscriptions(
                device_id TEXT NOT NULL, theme TEXT NOT NULL, product TEXT NOT NULL,
                PRIMARY KEY(device_id,theme,product));
            CREATE TABLE IF NOT EXISTS restock_jobs(
                id INTEGER PRIMARY KEY AUTOINCREMENT, device_id TEXT NOT NULL,
                theme TEXT NOT NULL, product TEXT NOT NULL, title TEXT NOT NULL,
                state TEXT NOT NULL DEFAULT 'pending', ticket TEXT, attempts INTEGER NOT NULL DEFAULT 0,
                next_attempt REAL NOT NULL DEFAULT 0, created REAL NOT NULL,
                UNIQUE(device_id,theme,product));
            CREATE TABLE IF NOT EXISTS shop_worker(
                id INTEGER PRIMARY KEY CHECK(id=1), next_run REAL NOT NULL DEFAULT 0,
                lease_until REAL NOT NULL DEFAULT 0, owner TEXT);
            INSERT OR IGNORE INTO shop_worker(id) VALUES(1);
            CREATE TABLE IF NOT EXISTS push_api_limits(key TEXT PRIMARY KEY, start REAL NOT NULL, count INTEGER NOT NULL);
        ''')
        with conn:
            yield conn
    finally:
        conn.close()


def remember_themes(themes):
    with connect() as conn:
        conn.executemany('INSERT INTO theme_history(slug,payload) VALUES(?,?) '
                         'ON CONFLICT(slug) DO UPDATE SET payload=excluded.payload',
                         [(theme['slug'], json.dumps(theme)) for theme in themes])
        saved = [json.loads(row['payload']) for row in conn.execute('SELECT payload FROM theme_history ORDER BY slug')]
    current = {theme['slug']: theme for theme in themes}
    return list(current.values()) + [theme for theme in saved if theme['slug'] not in current]


def secret_hash(secret):
    return hashlib.sha256(secret.encode()).hexdigest()


def authenticated(conn, device_id, secret):
    row = conn.execute('SELECT * FROM push_devices WHERE id=?', (device_id,)).fetchone()
    return row if row and hmac.compare_digest(row['secret_hash'], secret_hash(secret)) else None
