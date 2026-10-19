"""Offline tests for PostgreSQL MV catalog API persistence."""

import unittest
from datetime import datetime, timezone
from unittest.mock import patch

import mv_catalog as catalog


class MVPersistenceTests(unittest.TestCase):
    def setUp(self):
        self.previous_cache = catalog._cache
        self.previous_until = catalog._cache_until
        catalog._cache = None
        catalog._cache_until = 0.0
        self.addCleanup(self.restore_cache)

    def restore_cache(self):
        catalog._cache = self.previous_cache
        catalog._cache_until = self.previous_until

    def sample(self, partial=False):
        return catalog.CatalogResponse(
            fetched_at=datetime.now(timezone.utc),
            partial=partial,
            sources=[],
            videos=[
                catalog.CatalogVideo(
                    id="7DBSMzbPQzc",
                    title="Raven Sky",
                    categories=["unclassified"],
                    published_at=datetime.now(timezone.utc),
                    thumbnail_url=None,
                    view_count=100,
                    like_count=10,
                    url="https://www.youtube.com/watch?v=7DBSMzbPQzc",
                    channel_id="UCln9P4Qm3-EAY4aiEPmRwEA",
                    channel_title="Ado",
                    playlist_ids=[],
                    aliases=[],
                )
            ],
            unavailable_video_ids=[],
        )

    @patch("services.mv_catalog_db.load_catalog_from_db")
    def test_success_reads_postgres(self, reader):
        reader.return_value = self.sample()

        response = catalog.mv_catalog()

        self.assertEqual(len(response.videos), 1)
        self.assertTrue(response.cached)
        reader.assert_called_once()

    @patch("services.mv_catalog_db.load_catalog_from_db")
    def test_postgres_failure_uses_memory(self, reader):
        catalog._cache = self.sample()
        catalog._cache_until = 0.0
        reader.side_effect = RuntimeError("PostgreSQL unavailable")

        response = catalog.mv_catalog()

        self.assertEqual(response.videos[0].id, "7DBSMzbPQzc")
        self.assertTrue(response.cached)

    @patch("services.mv_catalog_db.load_catalog_from_db")
    def test_partial_postgres_catalog_rejected(self, reader):
        reader.return_value = self.sample(partial=True)

        with self.assertRaises(catalog.HTTPException) as ctx:
            catalog.mv_catalog()

        self.assertEqual(ctx.exception.status_code, 503)
        self.assertIsNone(catalog._cache)

    @patch("services.mv_catalog_db.load_catalog_from_db")
    def test_valid_memory_cache_precedes_postgres(self, reader):
        catalog._cache = self.sample()
        catalog._cache_until = float("inf")

        response = catalog.mv_catalog()

        self.assertEqual(len(response.videos), 1)
        self.assertTrue(response.cached)
        reader.assert_not_called()

    @patch("services.mv_catalog_db.load_catalog_from_db")
    def test_unavailable_postgres_returns_503(self, reader):
        reader.side_effect = RuntimeError("PostgreSQL unavailable")

        with self.assertRaises(catalog.HTTPException) as ctx:
            catalog.mv_catalog()

        self.assertEqual(ctx.exception.status_code, 503)


if __name__ == "__main__":
    unittest.main()
