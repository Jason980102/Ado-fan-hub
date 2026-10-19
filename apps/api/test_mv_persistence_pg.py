"""Offline tests for PostgreSQL-only MV persistence."""

import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from mv_catalog import CatalogResponse, CatalogVideo
from services.mv_persistence import persist_mv_catalog


class MVPostgresPersistenceTests(unittest.TestCase):

    def make_catalog(self, partial=False, empty=False):
        videos = [] if empty else [
            CatalogVideo(
                id="aaaaaaaaaaa",
                title="Offline Test",
                categories=["original"],
                published_at=datetime.now(timezone.utc),
                thumbnail_url=None,
                view_count=1,
                like_count=1,
                url="https://www.youtube.com/watch?v=aaaaaaaaaaa",
                channel_id="UCln9P4Qm3-EAY4aiEPmRwEA",
                channel_title="Ado",
                playlist_ids=[],
                aliases=[],
            )
        ]

        return CatalogResponse(
            fetched_at=datetime.now(timezone.utc),
            partial=partial,
            sources=[],
            videos=videos,
            unavailable_video_ids=[],
        )

    @patch("services.mv_persistence.save_catalog_to_db")
    def test_valid_catalog_is_written(self, writer):
        writer.return_value = 1
        catalog = self.make_catalog()

        self.assertEqual(persist_mv_catalog(catalog), 1)
        writer.assert_called_once_with(catalog)

    @patch("services.mv_persistence.save_catalog_to_db")
    def test_partial_catalog_is_rejected(self, writer):
        with self.assertRaises(ValueError):
            persist_mv_catalog(self.make_catalog(partial=True))
        writer.assert_not_called()

    @patch("services.mv_persistence.save_catalog_to_db")
    def test_empty_catalog_is_rejected(self, writer):
        with self.assertRaises(ValueError):
            persist_mv_catalog(self.make_catalog(empty=True))
        writer.assert_not_called()

    @patch("services.mv_persistence.save_catalog_to_db")
    def test_database_failure_is_propagated(self, writer):
        writer.side_effect = RuntimeError("PostgreSQL unavailable")

        with self.assertRaisesRegex(
            RuntimeError, "PostgreSQL unavailable"
        ):
            persist_mv_catalog(self.make_catalog())


if __name__ == "__main__":
    unittest.main()
