"""Offline HTTP + isolated PostgreSQL integration tests for X."""

import os
import unittest
from datetime import datetime, timezone

import httpx
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker

from news_sources.x_client import XAPIClientError, fetch_x_timeline_records
from services.x_sync_pipeline import run_x_sync_pipeline


SOURCE = "x_ado"
AUTHOR = "123456789"
POST_ID = "987654321012345678"
MONTH = "2099-11"


def test_database_url():
    raw = os.environ.get("DATABASE_URL")
    if not raw:
        raise RuntimeError("Explicit test DATABASE_URL required")

    url = make_url(raw)

    if (
        url.host != "127.0.0.1"
        or url.port != 5434
        or url.database != "ado_fan_hub_test"
        or url.username != "ado_test"
    ):
        raise RuntimeError("Unsafe test database target")

    return url


class XClientPipelineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine(test_database_url())

        with cls.engine.connect() as conn:
            identity = conn.execute(
                text("SELECT current_database(), current_user")
            ).one()

            revision = conn.execute(
                text("SELECT version_num FROM alembic_version")
            ).scalar_one()

            if tuple(identity) != ("ado_fan_hub_test", "ado_test"):
                raise RuntimeError("Wrong test database identity")

            if revision != "f3a8c2d9e451":
                raise RuntimeError("Wrong test database revision")

        cls.factory = sessionmaker(
            bind=cls.engine,
            expire_on_commit=False,
        )

    @classmethod
    def tearDownClass(cls):
        cls.engine.dispose()

    def setUp(self):
        with self.engine.connect() as conn:
            existing = conn.execute(
                text(
                    "SELECT COUNT(*) FROM x_api_budget "
                    "WHERE billing_month = :month"
                ),
                {"month": MONTH},
            ).scalar_one()

            if existing:
                self.fail("Test billing month already in use")

    def tearDown(self):
        # Only isolated test records are removed.
        with self.engine.begin() as conn:
            conn.execute(
                text(
                    "DELETE FROM news_articles "
                    "WHERE source_code = :source "
                    "AND external_id = :post_id"
                ),
                {"source": SOURCE, "post_id": POST_ID},
            )
            conn.execute(
                text(
                    "DELETE FROM x_sync_state "
                    "WHERE source_code = :source "
                    "AND x_user_id = :author"
                ),
                {"source": SOURCE, "author": AUTHOR},
            )
            conn.execute(
                text(
                    "DELETE FROM x_api_budget "
                    "WHERE billing_month = :month"
                ),
                {"month": MONTH},
            )

    def fetch_callback(self, *, fail=False):
        def handler(request):
            if fail:
                return httpx.Response(
                    429,
                    json={"error": "rate limited"},
                )

            return httpx.Response(
                200,
                json={
                    "data": [{
                        "id": POST_ID,
                        "author_id": AUTHOR,
                        "text": "Offline integration test",
                        "created_at": "2026-10-19T00:00:00Z",
                    }],
                    "meta": {"result_count": 1},
                },
            )

        def callback():
            return fetch_x_timeline_records(
                bearer_token="offline-token",
                x_user_id=AUTHOR,
                max_pages=1,
                max_posts=10,
                transport=httpx.MockTransport(handler),
            )

        return callback

    def test_successful_sync(self):
        result = run_x_sync_pipeline(
            self.factory,
            SOURCE,
            AUTHOR,
            MONTH,
            10,
            self.fetch_callback(),
            max_pages=1,
        )

        self.assertEqual(result["received_posts"], 1)
        self.assertEqual(result["sync"]["written"], 1)

        with self.engine.connect() as conn:
            count = conn.execute(
                text(
                    "SELECT COUNT(*) FROM news_articles "
                    "WHERE source_code = :source "
                    "AND external_id = :post_id"
                ),
                {"source": SOURCE, "post_id": POST_ID},
            ).scalar_one()

            reserved = conn.execute(
                text(
                    "SELECT reserved_posts FROM x_api_budget "
                    "WHERE billing_month = :month"
                ),
                {"month": MONTH},
            ).scalar_one()

        self.assertEqual(count, 1)
        self.assertEqual(reserved, 10)

    def test_failed_api_keeps_reservation(self):
        with self.assertRaises(XAPIClientError):
            run_x_sync_pipeline(
                self.factory,
                SOURCE,
                AUTHOR,
                MONTH,
                10,
                self.fetch_callback(fail=True),
                max_pages=1,
            )

        with self.engine.connect() as conn:
            reserved = conn.execute(
                text(
                    "SELECT reserved_posts FROM x_api_budget "
                    "WHERE billing_month = :month"
                ),
                {"month": MONTH},
            ).scalar_one()

        self.assertEqual(reserved, 10)

    def test_duplicate_sync_is_idempotent(self):
        first = run_x_sync_pipeline(
            self.factory,
            SOURCE,
            AUTHOR,
            MONTH,
            10,
            self.fetch_callback(),
            max_pages=1,
        )

        second = run_x_sync_pipeline(
            self.factory,
            SOURCE,
            AUTHOR,
            MONTH,
            10,
            self.fetch_callback(),
            max_pages=1,
        )

        self.assertEqual(first["sync"]["written"], 1)
        self.assertEqual(second["sync"]["written"], 0)


if __name__ == "__main__":
    unittest.main()