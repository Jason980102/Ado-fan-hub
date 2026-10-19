"""Offline integration tests for the review-only official MV playlist."""

import unittest
from datetime import datetime, timezone
from unittest.mock import patch

import mv_catalog as catalog
from mv_playlists import sync_official_playlists

CHANNEL = "UCln9P4Qm3-EAY4aiEPmRwEA"
UPLOADS = "UUln9P4Qm3-EAY4aiEPmRwEA"
VIDEO_ID = "7DBSMzbPQzc"
NEW_PLAYLIST = "PLaxauk3chSWgJmo2hBhN34rO8sUEwWiQx"
ORIGINAL = "PLaxauk3chSWgwI1W0yo5Bv9GAn1O1cwKB"


class NewPlaylistSyncTests(unittest.TestCase):

    def setUp(self):
        self.old_cache = catalog._cache
        self.old_cache_until = catalog._cache_until
        self.addCleanup(self.restore_cache)
        catalog._cache = None
        catalog._cache_until = 0

    def restore_cache(self):
        catalog._cache = self.old_cache
        catalog._cache_until = self.old_cache_until

    def sample(self):
        return catalog.CatalogResponse(
            fetched_at=datetime(2026, 10, 1, tzinfo=timezone.utc),
            sources=[
                catalog.CatalogSource(
                    id=UPLOADS,
                    title="Ado official uploads",
                    available=True,
                    item_count=775,
                ),
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
                    view_count=1000,
                    like_count=100,
                    url="https://www.youtube.com/watch?v=" + VIDEO_ID,
                    channel_id=CHANNEL,
                    channel_title="Ado",
                    playlist_ids=[UPLOADS],
                    aliases=[],
                ),
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

    def run_sync(self, memberships, metadata=None, base=None):
        if metadata is None:
            metadata = self.metadata()
        if base is None:
            base = self.sample()

        stored = [base.model_copy(deep=True)]

        def read_db():
            return stored[0].model_copy(deep=True)

        def write_db(official_memberships, playlist_sources):
            from test_mv_playlist_sync_mock import simulate_playlist_write
            count, updated = simulate_playlist_write(
                stored[0], official_memberships, playlist_sources
            )
            stored[0] = updated
            return count

        with (
            patch("mv_playlists.load_catalog_from_db",
                  side_effect=read_db),
            patch("mv_playlists.save_playlist_memberships",
                  side_effect=write_db) as save,
            patch.object(
                catalog, "_configuration",
                return_value=("dummy-key", CHANNEL, []),
            ),
            patch.object(
                catalog, "_youtube",
                return_value=metadata,
            ),
            patch.object(
                catalog, "_playlist_video_ids",
                side_effect=lambda key, pid: memberships.get(pid, []),
            ),
        ):
            changed = sync_official_playlists()

        save.assert_called_once()
        return changed, stored[0]

    def test_new_playlist_is_review_only(self):
        self.assertIn(NEW_PLAYLIST, catalog.SOURCES)
        self.assertIsNone(catalog.SOURCES[NEW_PLAYLIST][1])

    def test_new_playlist_preserves_unclassified(self):
        changed, updated = self.run_sync({
            NEW_PLAYLIST: [VIDEO_ID],
        })
        self.assertEqual(changed, 1)
        video = updated.videos[0]
        self.assertEqual(video.categories, ["unclassified"])
        self.assertIn(NEW_PLAYLIST, video.playlist_ids)
        self.assertIn(UPLOADS, video.playlist_ids)

    def test_new_playlist_preserves_original(self):
        changed, updated = self.run_sync({
            ORIGINAL: [VIDEO_ID],
            NEW_PLAYLIST: [VIDEO_ID],
        })
        self.assertEqual(changed, 1)
        video = updated.videos[0]
        self.assertEqual(video.categories, ["original"])
        self.assertIn(ORIGINAL, video.playlist_ids)
        self.assertIn(NEW_PLAYLIST, video.playlist_ids)

    def test_invalid_ownership_does_not_persist(self):
        with (
            patch(
                "mv_playlists.load_catalog_from_db",
                return_value=self.sample(),
            ),
            patch("mv_playlists.save_playlist_memberships") as persist,
            patch.object(
                catalog,
                "_configuration",
                return_value=("dummy-key", CHANNEL, []),
            ),
            patch.object(
                catalog,
                "_youtube",
                return_value={"items": []},
            ),
        ):
            with self.assertRaises(ValueError):
                sync_official_playlists()

        persist.assert_not_called()


if __name__ == "__main__":
    unittest.main()
