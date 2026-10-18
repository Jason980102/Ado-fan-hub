import unittest
from datetime import datetime, timezone
from unittest.mock import patch

import mv_catalog as catalog
from mv_playlists import sync_official_playlists

CHANNEL = "UCln9P4Qm3-EAY4aiEPmRwEA"
VIDEO_ID = "7DBSMzbPQzc"
UPLOADS = "UUln9P4Qm3-EAY4aiEPmRwEA"


class PlaylistSyncTests(unittest.TestCase):

    def setUp(self):
        old_cache = catalog._cache
        old_until = catalog._cache_until

        catalog._cache = None
        catalog._cache_until = 0

        def restore():
            catalog._cache = old_cache
            catalog._cache_until = old_until

        self.addCleanup(restore)

    def sample(self, categories=None, playlist_ids=None):
        return catalog.CatalogResponse(
            fetched_at=datetime(
                2026, 10, 1, tzinfo=timezone.utc
            ),
            sources=[
                catalog.CatalogSource(
                    id=UPLOADS,
                    title="Ado official uploads",
                    available=True,
                    item_count=775,
                )
            ],
            videos=[
                catalog.CatalogVideo(
                    id=VIDEO_ID,
                    title="Raven Sky",
                    categories=categories or ["unclassified"],
                    published_at=datetime(
                        2026, 10, 16, tzinfo=timezone.utc
                    ),
                    thumbnail_url=None,
                    view_count=12345,
                    like_count=500,
                    url="https://www.youtube.com/watch?v="
                        + VIDEO_ID,
                    channel_id=CHANNEL,
                    channel_title="Ado",
                    playlist_ids=playlist_ids or [UPLOADS],
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

    def run_sync(self, base, playlist_members,
                 response=None):
        if response is None:
            response = self.metadata()

        with (
            patch(
                "mv_playlists.load_catalog",
                return_value=base.model_dump(mode="json"),
            ),
            patch("mv_playlists.save_catalog") as save,
            patch.object(
                catalog, "_configuration",
                return_value=("key", CHANNEL, []),
            ),
            patch.object(
                catalog, "_youtube",
                return_value=response,
            ),
            patch.object(
                catalog, "_playlist_video_ids",
                side_effect=lambda key, pid:
                    playlist_members.get(pid, []),
            ),
        ):
            changed = sync_official_playlists()

        return changed, save.call_args.args[0]

    def test_unclassified_becomes_original(self):
        original_pid = next(
            pid for pid, (_, category)
            in catalog.SOURCES.items()
            if category == "original"
        )

        changed, updated = self.run_sync(
            self.sample(),
            {original_pid: [VIDEO_ID]},
        )

        self.assertEqual(changed, 1)
        video = updated.videos[0]
        self.assertEqual(video.categories, ["original"])
        self.assertIn(UPLOADS, video.playlist_ids)
        self.assertIn(original_pid, video.playlist_ids)
        self.assertEqual(video.view_count, 12345)

    def test_removed_from_playlist_becomes_unclassified(self):
        original_pid = next(
            pid for pid, (_, category)
            in catalog.SOURCES.items()
            if category == "original"
        )

        base = self.sample(
            categories=["original"],
            playlist_ids=[UPLOADS, original_pid],
        )

        changed, updated = self.run_sync(base, {})

        self.assertEqual(changed, 1)
        self.assertEqual(
            updated.videos[0].categories,
            ["unclassified"],
        )
        self.assertEqual(
            updated.videos[0].playlist_ids,
            [UPLOADS],
        )

    def test_multiple_official_categories(self):
        selected = [
            pid for pid, (_, category)
            in catalog.SOURCES.items()
            if category in ("original", "live")
        ]

        _, updated = self.run_sync(
            self.sample(),
            {pid: [VIDEO_ID] for pid in selected},
        )

        self.assertEqual(
            set(updated.videos[0].categories),
            {"original", "live"},
        )

    def test_failed_ownership_does_not_save(self):
        base = self.sample()

        with (
            patch(
                "mv_playlists.load_catalog",
                return_value=base.model_dump(mode="json"),
            ),
            patch("mv_playlists.save_catalog") as save,
            patch.object(
                catalog, "_configuration",
                return_value=("key", CHANNEL, []),
            ),
            patch.object(
                catalog, "_youtube",
                return_value={"items": []},
            ),
        ):
            with self.assertRaises(ValueError):
                sync_official_playlists()

        save.assert_not_called()
        self.assertIsNone(catalog._cache)


if __name__ == "__main__":
    unittest.main()
