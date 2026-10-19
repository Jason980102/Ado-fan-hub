import unittest
from datetime import datetime, timezone
from unittest.mock import patch

import mv_catalog as catalog
from mv_incremental import sync_recent_feed


CHANNEL = "UCln9P4Qm3-EAY4aiEPmRwEA"
NEW_ID = "7DBSMzbPQzc"
OLD_ID = "abcdefghijk"


class IncrementalTests(unittest.TestCase):

    def setUp(self):
        old_cache = catalog._cache
        old_until = catalog._cache_until

        catalog._cache = None
        catalog._cache_until = 0

        def restore():
            catalog._cache = old_cache
            catalog._cache_until = old_until

        self.addCleanup(restore)

    def sample(self):
        return catalog.CatalogResponse(
            fetched_at=datetime(2026, 10, 1, tzinfo=timezone.utc),
            sources=[
                catalog.CatalogSource(
                    id="official",
                    title="Official playlist",
                    available=True,
                    item_count=1,
                )
            ],
            videos=[
                catalog.CatalogVideo(
                    id=OLD_ID,
                    title="Existing classified song",
                    categories=["original"],
                    published_at=datetime(
                        2026, 1, 1, tzinfo=timezone.utc
                    ),
                    thumbnail_url=None,
                    view_count=100,
                    like_count=10,
                    url="https://www.youtube.com/watch?v=" + OLD_ID,
                    channel_id=CHANNEL,
                    channel_title="Ado",
                    playlist_ids=["official"],
                    aliases=[],
                )
            ],
            unavailable_video_ids=[],
        )

    def metadata(self):
        return {
            "id": NEW_ID,
            "snippet": {
                "title": "New official song",
                "channelId": CHANNEL,
                "channelTitle": "Ado",
                "categoryId": "22",
                "publishedAt": "2026-10-16T00:00:00Z",
                "thumbnails": {},
            },
            "status": {
                "privacyStatus": "public",
                "uploadStatus": "processed",
            },
            "contentDetails": {"duration": "PT3M30S"},
            "statistics": {
                "viewCount": "1000",
                "likeCount": "100",
            },
        }

    def test_only_fetch_new_ids_and_preserve_categories(self):
        base = self.sample()

        with (
            patch("mv_incremental.load_catalog_from_db",
                  return_value=base.model_copy(deep=True)),
            patch("mv_incremental.persist_mv_catalog") as save,
            patch.object(catalog, "_configuration",
                         return_value=("key", CHANNEL, [])),
            patch.object(catalog, "_recent_feed_video_ids",
                         return_value=[OLD_ID, NEW_ID]),
            patch.object(catalog, "_youtube",
                         return_value={"items": [self.metadata()]}) as yt,
        ):
            count = sync_recent_feed()

        self.assertEqual(count, 1)
        self.assertEqual(yt.call_count, 1)
        self.assertEqual(
            yt.call_args.args[1]["id"],
            NEW_ID,
        )

        updated = save.call_args.args[0]
        by_id = {video.id: video for video in updated.videos}

        self.assertEqual(len(by_id), 2)
        self.assertEqual(by_id[OLD_ID].categories, ["original"])
        self.assertEqual(
            by_id[NEW_ID].categories,
            ["unclassified"],
        )

    def test_no_new_videos_uses_no_quota(self):
        base = self.sample()

        with (
            patch("mv_incremental.load_catalog_from_db",
                  return_value=base.model_copy(deep=True)),
            patch("mv_incremental.persist_mv_catalog") as save,
            patch.object(catalog, "_configuration",
                         return_value=("key", CHANNEL, [])),
            patch.object(catalog, "_recent_feed_video_ids",
                         return_value=[OLD_ID]),
            patch.object(catalog, "_youtube") as yt,
        ):
            count = sync_recent_feed()

        self.assertEqual(count, 0)
        yt.assert_not_called()
        save.assert_not_called()

    def test_failed_metadata_does_not_replace_snapshot(self):
        base = self.sample()

        with (
            patch("mv_incremental.load_catalog_from_db",
                  return_value=base.model_copy(deep=True)),
            patch("mv_incremental.persist_mv_catalog") as save,
            patch.object(catalog, "_configuration",
                         return_value=("key", CHANNEL, [])),
            patch.object(catalog, "_recent_feed_video_ids",
                         return_value=[NEW_ID]),
            patch.object(catalog, "_youtube",
                         return_value={"items": []}),
        ):
            with self.assertRaises(ValueError):
                sync_recent_feed()

        save.assert_not_called()
        self.assertIsNone(catalog._cache)

    def test_short_is_not_added(self):
        base = self.sample()
        short = self.metadata()
        short["snippet"]["title"] = "Promo #Shorts"

        with (
            patch("mv_incremental.load_catalog_from_db",
                  return_value=base.model_copy(deep=True)),
            patch("mv_incremental.persist_mv_catalog") as save,
            patch.object(catalog, "_configuration",
                         return_value=("key", CHANNEL, [])),
            patch.object(catalog, "_recent_feed_video_ids",
                         return_value=[NEW_ID]),
            patch.object(catalog, "_youtube",
                         return_value={"items": [short]}),
        ):
            count = sync_recent_feed()

        self.assertEqual(count, 0)
        save.assert_not_called()


if __name__ == "__main__":
    unittest.main()
