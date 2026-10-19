"""Offline validation tests for PostgreSQL MV catalog writer."""

import unittest
from unittest.mock import patch

from mv_catalog import CatalogResponse, CatalogSource, CatalogVideo
from services.mv_catalog_writer import save_catalog_to_db
from datetime import datetime, timezone


class MVCatalogWriterTests(unittest.TestCase):

    def make_video(self, video_id):
        return CatalogVideo(
            id=video_id,
            title="Offline Ado Test",
            categories=["original"],
            published_at=datetime.now(timezone.utc),
            thumbnail_url=None,
            view_count=100,
            like_count=10,
            url="https://www.youtube.com/watch?v=" + video_id,
            channel_id="UCln9P4Qm3-EAY4aiEPmRwEA",
            channel_title="Ado",
            playlist_ids=[],
            aliases=[],
        )

    def make_catalog(self, videos, partial=False):
        return CatalogResponse(
            fetched_at=datetime.now(timezone.utc),
            partial=partial,
            sources=[
                CatalogSource(
                    id="offline",
                    title="Offline test",
                    available=True,
                    item_count=len(videos),
                )
            ],
            videos=videos,
            unavailable_video_ids=[],
        )

    @patch("services.mv_catalog_writer.create_db_engine")
    def test_partial_catalog_rejected_before_database(self, engine):
        catalog = self.make_catalog(
            [self.make_video("aaaaaaaaaaa")],
            partial=True,
        )
        with self.assertRaises(ValueError):
            save_catalog_to_db(catalog)
        engine.assert_not_called()

    @patch("services.mv_catalog_writer.create_db_engine")
    def test_empty_catalog_rejected_before_database(self, engine):
        catalog = self.make_catalog([])
        with self.assertRaises(ValueError):
            save_catalog_to_db(catalog)
        engine.assert_not_called()

    @patch("services.mv_catalog_writer.create_db_engine")
    def test_duplicate_video_ids_rejected(self, engine):
        video = self.make_video("bbbbbbbbbbb")
        catalog = self.make_catalog([video, video])

        with self.assertRaises(ValueError):
            save_catalog_to_db(catalog)

        engine.assert_not_called()

    @patch("services.mv_catalog_writer.create_db_engine")
    def test_wrong_type_rejected(self, engine):
        with self.assertRaises(TypeError):
            save_catalog_to_db({"videos": []})

        engine.assert_not_called()


if __name__ == "__main__":
    unittest.main()
