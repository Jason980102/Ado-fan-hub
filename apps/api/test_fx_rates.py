import json
import tempfile
import subprocess
import sys
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from fx_rates import FxService, FxStore, FxWorker, parse_frankfurter, router

UTC = timezone.utc


class FxTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / 'fx.sqlite3'
        self.now = datetime(2026, 10, 18, 12, tzinfo=UTC)
        self.calls = 0
        self.fail = False
        self.rate_date = self.now.date().isoformat()
        self.service = FxService(FxStore(self.path), self.fetch, lambda: self.now)

    def fetch(self, now):
        self.calls += 1
        if self.fail:
            raise OSError('offline')
        return parse_frankfurter([
            {'base': 'JPY', 'quote': q, 'date': self.rate_date, 'rate': rate}
            for q, rate in [('USD', .0067), ('TWD', .21)]
        ], now)

    def test_shared_persistent_snapshot_and_hourly_refresh(self):
        first = self.service.get()
        other = FxService(FxStore(self.path), self.fetch, lambda: self.now)
        self.assertEqual(other.get(), first)
        self.assertEqual(self.calls, 1)
        self.now += timedelta(hours=1)
        self.assertFalse(other.get()['stale'])
        self.assertEqual(self.calls, 2)

    def test_midnight_expires_even_after_ten_minutes(self):
        self.now = self.now.replace(hour=23, minute=55)
        self.service.get()
        self.now += timedelta(minutes=10)
        result = self.service.get()
        self.assertEqual(self.calls, 2)
        self.assertTrue(result['awaitingPublication'])
        self.assertFalse(result['stale'])
        self.assertEqual(result['dates']['USD'], '2026-10-18')
        self.assertEqual(datetime.fromisoformat(result['nextCheckAt']) - self.now, timedelta(minutes=15))

    def test_publication_delay_eventually_picks_up_new_date(self):
        self.rate_date = '2026-10-17'
        self.service.get()
        self.now += timedelta(minutes=15)
        self.rate_date = '2026-10-18'
        result = self.service.get()
        self.assertFalse(result['awaitingPublication'])
        self.assertEqual(result['dates']['TWD'], self.rate_date)

    def test_failure_keeps_snapshot_and_retries_after_five_minutes(self):
        old = self.service.get()
        self.now += timedelta(hours=1)
        self.fail = True
        with self.assertLogs('fx_rates', level='WARNING'):
            stale = self.service.get()
        self.assertTrue(stale['stale'])
        self.assertEqual(stale['checkedAt'], old['checkedAt'])
        self.service.get()
        self.assertEqual(self.calls, 2)
        self.now += timedelta(minutes=5)
        self.fail = False
        self.assertFalse(self.service.get()['stale'])
        self.assertEqual(self.calls, 3)

    def test_concurrent_services_only_one_upstream_refresh(self):
        self.service.get()
        self.now += timedelta(hours=1)
        entered, release = threading.Event(), threading.Event()

        def slow(now):
            entered.set()
            release.wait(5)
            return self.fetch(now)

        owner = FxService(FxStore(self.path), slow, lambda: self.now)
        with ThreadPoolExecutor(max_workers=21) as executor:
            first = executor.submit(owner.get)
            self.assertTrue(entered.wait(3))
            others = [executor.submit(FxService(FxStore(self.path), self.fetch, lambda: self.now).get) for _ in range(20)]
            try:
                for future in others:
                    self.assertTrue(future.result(timeout=3)['stale'])
                self.assertEqual(self.calls, 1)
            finally:
                release.set()
            self.assertFalse(first.result(timeout=3)['stale'])
        self.assertEqual(self.calls, 2)

    def test_expired_lease_recovery_and_old_owner_cannot_overwrite(self):
        store = self.service.store
        self.assertTrue(store.claim(self.now.timestamp(), 'old'))
        self.assertFalse(store.claim(self.now.timestamp(), 'new'))
        self.now += timedelta(seconds=61)
        self.assertTrue(store.claim(self.now.timestamp(), 'new'))
        store.finish('old', {'incorrect': True}, 0, False)
        self.assertIsNone(store.read()['payload'])
        store.finish('new', None, self.now.timestamp() + 300, True)
        self.assertEqual(store.read()['lease_until'], 0)

    def test_separate_processes_share_one_lease(self):
        command = [sys.executable, '-B', '-c',
                   'import sys; from fx_rates import FxStore; '
                   'print(int(FxStore(sys.argv[1]).claim(float(sys.argv[2]), sys.argv[3])))',
                   str(self.path), str(self.now.timestamp())]
        with ThreadPoolExecutor(max_workers=4) as executor:
            futures = [executor.submit(subprocess.check_output, command + [str(i)], text=True) for i in range(4)]
            claims = [int(future.result(timeout=20).strip()) for future in futures]
        self.assertEqual(sum(claims), 1)

    def test_date_regression_cannot_replace_newer_data(self):
        old = self.service.get()
        self.now += timedelta(hours=1)
        self.rate_date = '2026-10-17'
        with self.assertLogs('fx_rates', level='WARNING'):
            result = self.service.get()
        self.assertTrue(result['stale'])
        self.assertEqual(result['dates'], old['dates'])

    def test_http_success_and_cold_failure(self):
        app = FastAPI()
        app.include_router(router)
        with patch('fx_rates.get_service', return_value=self.service), TestClient(app) as client:
            self.fail = True
            with self.assertLogs('fx_rates', level='WARNING'):
                result = client.get('/api/fx/rates')
            self.assertEqual(result.status_code, 503)
            self.assertEqual(result.headers['retry-after'], '5')
            self.fail = False
            self.now += timedelta(minutes=5)
            result = client.get('/api/fx/rates')
            self.assertEqual(result.status_code, 200)
            self.assertEqual(result.headers['cache-control'], 'no-store')
            self.assertEqual(result.json()['rates']['JPY'], 1)

    def test_invalid_source_data_rejected(self):
        good = [{'base': 'JPY', 'quote': q, 'date': '2026-10-18', 'rate': .1} for q in ('USD', 'TWD')]
        for field, value in [('date', '2026-02-30'), ('date', '2026-10-19'),
                             ('rate', 0), ('rate', float('nan')), ('rate', True), ('base', 'USD')]:
            bad = json.loads(json.dumps(good))
            bad[0][field] = value
            with self.subTest(field=field, value=value), self.assertRaises((ValueError, TypeError)):
                parse_frankfurter(bad, self.now)
        with self.assertRaises(ValueError):
            parse_frankfurter(good[:1], self.now)
        with self.assertRaises(ValueError):
            parse_frankfurter(good + good[:1], self.now)

    def test_background_updates_without_user_requests_and_stops(self):
        worker = FxWorker()
        waits = []

        def wait(seconds):
            waits.append(seconds)
            if len(waits) > 1:
                worker.stop_event.set()
            return worker.stop_event.is_set()

        with patch('fx_rates.get_service', return_value=self.service), patch.object(worker.stop_event, 'wait', side_effect=wait):
            worker.run()
        self.assertEqual(self.calls, 1)
        self.assertEqual(waits, [1, 60])


if __name__ == '__main__':
    unittest.main()
