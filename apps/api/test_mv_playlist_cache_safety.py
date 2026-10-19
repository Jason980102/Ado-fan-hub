"""Offline cache safety tests for official MV playlist sync."""

import unittest
from datetime import datetime, timezone
from unittest.mock import patch

import mv_catalog as catalog
from mv_playlists import sync_official_playlists

CHANNEL = "UCln9P4Qm3-EAY4aiEPmRwEA"
VIDEO_ID = "7DBSMzbPQzc"
UPLOADS = "UUln9P4Qm3-EAY4aiEPmRwEA"


class PlaylistCacheSafetyTests(unittest.TestCase):

    def setUp(self):
        old_cache = catalog._cache
        old_until = catalog._cache_until
        self.addCleanup(
            lambda: setattr(catalog, "_cache", old_cache)
        )
        self.addCleanup(
            lambda: setattr(catalog, "_cache_until", old_until)
        )
        catalog._cache = None
        catalog._cache_until = 0

    def sample(self, views=100):
        return catalog.CatalogResponse(
            fetched_at=datetime(2026, 10, 1, tzinfo=timezone.utc),
            sources=[
                catalog.CatalogSource(
                    id=UPLOADS,
                    title="Ado official uploads",
                    available=True,
                    item_count=1,
                )
            ],
            videos=[
                catalog.CatalogVideo(
                    id=VIDEO_ID,
                    title="Raven Sky",
                    categories=["unclassified"],
                    published_at=datetime(
                        2026, 10, 16, tzinfo=timezone.utc
                    ),
                    thumbnail_url=None,
                    view_count=views,
                    like_count=10,
                    url="https://www.youtube.com/watch?v=" + VIDEO_ID,
                    channel_id=CHANNEL,
                    channel_title="Ado",
                    playlist_ids=[UPLOADS],
                    aliases=[],
                )
            ],
            unavailable_video_ids=[],
        )

    def metadata(self):
        return {
            "items": [
                {
                    "id": pid,
                    "snippet": {
                        "channelId": CHANNEL,
                        "title": title,
                    },
                }
                for pid, (title, _) in catalog.SOURCES.items()
            ]
        }

    def mocks(self, base, writer):
        return (
            patch(
                "mv_playlists.load_catalog_from_db",
                return_value=base,
            ),
            patch(
                "mv_playlists.save_playlist_memberships",
                side_effect=writer,
            ),
            patch.object(
                catalog, "_configuration",
                return_value=("dummy-key", CHANNEL, []),
            ),
            patch.object(
                catalog, "_youtube",
                return_value=self.metadata(),
            ),
            patch.object(
                catalog, "_playlist_video_ids",
                return_value=[],
            ),
        )

    def test_writer_failure_does_not_publish_cache(self):
        old = self.sample(100)
        catalog._cache = old
        catalog._cache_until = 500

        patches = self.mocks(
            old,
            RuntimeError("database write failed"),
        )
        with (
            patches[0],
            patches[1],
            patches[2],
            patches[3],
            patches[4],
        ):
            with self.assertRaises(RuntimeError):
                sync_official_playlists()

        self.assertIs(catalog._cache, old)
        self.assertEqual(catalog._cache_until, 500)

    def test_success_reloads_latest_statistics(self):
        old = self.sample(100)
        latest = self.sample(200)

        reads = iter([old, latest])

        with (
            patch(
                "mv_playlists.load_catalog_from_db",
                side_effect=lambda: next(reads),
            ),
            patch(
                "mv_playlists.save_playlist_memberships",
                return_value=1,
            ),
            patch.object(
                catalog, "_configuration",
                return_value=("dummy-key", CHANNEL, []),
            ),
            patch.object(
                catalog, "_youtube",
                return_value=self.metadata(),
            ),
            patch.object(
                catalog, "_playlist_video_ids",
                return_value=[],
            ),
        ):
            changed = sync_official_playlists()

        self.assertEqual(changed, 1)
        self.assertEqual(
            catalog._cache.videos[0].view_count,
            200,
        )


if __name__ == "__main__":
    unittest.main()
