"""MV API PostgreSQL reader, cache and failure behavior tests."""

import unittest
from datetime import datetime, timezone
from unittest.mock import patch

import mv_catalog as catalog


class MVApiPostgresTests(unittest.TestCase):

    def setUp(self):
        self.previous_cache = catalog._cache
        self.previous_until = catalog._cache_until

        catalog._cache = None
        catalog._cache_until = 0.0

        self.addCleanup(self.restore_cache)

    def restore_cache(self):
        catalog._cache = self.previous_cache
        catalog._cache_until = self.previous_until

    def sample(self):
        return catalog.CatalogResponse(
            fetched_at=datetime.now(timezone.utc),
            partial=False,
            sources=[],
            videos=[
                catalog.CatalogVideo(
                    id="aaaaaaaaaaa",
                    title="PostgreSQL MV",
                    categories=["original"],
                    published_at=datetime.now(timezone.utc),
                    thumbnail_url=None,
                    view_count=10,
                    like_count=1,
                    url="https://www.youtube.com/watch?v=aaaaaaaaaaa",
                    channel_id="UCln9P4Qm3-EAY4aiEPmRwEA",
                    channel_title="Ado",
                    playlist_ids=[],
                    aliases=[],
                )
            ],
            unavailable_video_ids=[],
        )

    @patch("services.mv_catalog_db.load_catalog_from_db")
    def test_postgres_reader_success(self, reader):
        reader.return_value = self.sample()

        result = catalog.mv_catalog()

        self.assertEqual(len(result.videos), 1)
        self.assertTrue(result.cached)
        reader.assert_called_once()

    @patch("services.mv_catalog_db.load_catalog_from_db")
    def test_memory_cache_prevents_database_read(self, reader):
        catalog._cache = self.sample()
        catalog._cache_until = float("inf")

        result = catalog.mv_catalog()

        self.assertTrue(result.cached)
        reader.assert_not_called()

    @patch("services.mv_catalog_db.load_catalog_from_db")
    def test_database_error_uses_existing_cache(self, reader):
        catalog._cache = self.sample()
        catalog._cache_until = 0.0
        reader.side_effect = RuntimeError("Database unavailable")

        result = catalog.mv_catalog()

        self.assertTrue(result.cached)
        self.assertEqual(len(result.videos), 1)

    @patch("services.mv_catalog_db.load_catalog_from_db")
    def test_database_error_without_cache_returns_503(self, reader):
        reader.side_effect = RuntimeError("Database unavailable")

        with self.assertRaises(catalog.HTTPException) as context:
            catalog.mv_catalog()

        self.assertEqual(context.exception.status_code, 503)

    @patch("services.mv_catalog_db.load_catalog_from_db")
    def test_page_does_not_call_youtube_api(self, reader):
        reader.return_value = self.sample()

        with (
            patch.object(
                catalog, "_youtube",
                side_effect=AssertionError("YouTube API called"),
            ),
            patch.object(
                catalog, "_fetch_catalog",
                side_effect=AssertionError("Full fetch called"),
            ),
        ):
            result = catalog.mv_catalog()

        self.assertEqual(len(result.videos), 1)


if __name__ == "__main__":
    unittest.main()
