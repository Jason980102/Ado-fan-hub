"""Verify PostgreSQL is authoritative for MV incremental sync."""

import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import mv_catalog as catalog
from mv_incremental import sync_recent_feed


class MVPostgresAuthorityTests(unittest.TestCase):

    def setUp(self):
        self.old_cache = catalog._cache
        self.old_until = catalog._cache_until
        catalog._cache = None
        catalog._cache_until = 0.0
        self.addCleanup(self.restore_cache)

    def restore_cache(self):
        catalog._cache = self.old_cache
        catalog._cache_until = self.old_until

    def sample(self, videos, fetched_at):
        return catalog.CatalogResponse(
            fetched_at=fetched_at,
            partial=False,
            sources=[],
            videos=videos,
            unavailable_video_ids=[],
        )

    def video(self, vid):
        return catalog.CatalogVideo(
            id=vid,
            title="Official Test Video",
            categories=["unclassified"],
            published_at=datetime.now(timezone.utc),
            thumbnail_url=None,
            view_count=0,
            like_count=0,
            url=f"https://www.youtube.com/watch?v={vid}",
            channel_id="UCln9P4Qm3-EAY4aiEPmRwEA",
            channel_title="Ado",
            playlist_ids=[],
            aliases=[],
        )

    def test_newer_memory_cannot_override_postgres(self):
        now = datetime.now(timezone.utc)
        video = self.video("aaaaaaaaaaa")

        postgres = self.sample(
            [video],
            now - timedelta(minutes=10),
        )

        # More recent timestamp, but missing the video.
        memory = self.sample(
            [],
            now,
        )

        catalog._cache = memory

        with (
            patch(
                "mv_incremental.load_catalog_from_db",
                return_value=postgres,
            ) as reader,
            patch.object(
                catalog,
                "_configuration",
                return_value=(
                    "key",
                    "UCln9P4Qm3-EAY4aiEPmRwEA",
                    [],
                ),
            ),
            patch.object(
                catalog,
                "_recent_feed_video_ids",
                return_value=["aaaaaaaaaaa"],
            ),
            patch.object(
                catalog,
                "_youtube",
                side_effect=AssertionError(
                    "Already stored video must not be fetched"
                ),
            ),
            patch(
                "mv_incremental.persist_mv_catalog",
            ) as writer,
        ):
            added = sync_recent_feed()

        self.assertEqual(added, 0)
        reader.assert_called_once()
        writer.assert_not_called()


if __name__ == "__main__":
    unittest.main()
