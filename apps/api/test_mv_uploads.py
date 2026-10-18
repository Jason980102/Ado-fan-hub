import unittest
from datetime import datetime, timezone
from unittest.mock import patch

import mv_catalog as catalog
from mv_uploads import sync_full_uploads


class FullUploadsTests(unittest.TestCase):

    def setUp(self):
        previous_cache = catalog._cache
        previous_until = catalog._cache_until

        catalog._cache = None
        catalog._cache_until = 0

        def restore():
            catalog._cache = previous_cache
            catalog._cache_until = previous_until

        self.addCleanup(restore)

    def sample(self, partial=False, with_video=True):
        videos = []

        if with_video:
            videos.append(
                catalog.CatalogVideo(
                    id="7DBSMzbPQzc",
                    title="Raven Sky",
                    categories=["unclassified"],
                    published_at=datetime.now(timezone.utc),
                    thumbnail_url=None,
                    view_count=None,
                    like_count=None,
                    url="https://www.youtube.com/watch?v=7DBSMzbPQzc",
                    channel_id="UCln9P4Qm3-EAY4aiEPmRwEA",
                    channel_title="Ado",
                    playlist_ids=[],
                    aliases=[],
                )
            )

        return catalog.CatalogResponse(
            fetched_at=datetime.now(timezone.utc),
            partial=partial,
            sources=[],
            videos=videos,
            unavailable_video_ids=[],
        )

    def test_success_saves_and_updates_memory(self):
        result = self.sample()

        with (
            patch.object(
                catalog, "_configuration",
                return_value=("key", "channel", []),
            ),
            patch.object(
                catalog, "_fetch_catalog",
                return_value=result,
            ),
            patch("mv_uploads.save_catalog") as save,
        ):
            count = sync_full_uploads()

        self.assertEqual(count, 1)
        save.assert_called_once_with(result)
        self.assertIs(catalog._cache, result)

    def test_partial_refresh_keeps_old_cache(self):
        old = self.sample()
        catalog._cache = old

        with (
            patch.object(
                catalog, "_configuration",
                return_value=("key", "channel", []),
            ),
            patch.object(
                catalog, "_fetch_catalog",
                return_value=self.sample(partial=True),
            ),
            patch("mv_uploads.save_catalog") as save,
        ):
            with self.assertRaises(RuntimeError):
                sync_full_uploads()

        save.assert_not_called()
        self.assertIs(catalog._cache, old)

    def test_empty_refresh_does_not_overwrite(self):
        with (
            patch.object(
                catalog, "_configuration",
                return_value=("key", "channel", []),
            ),
            patch.object(
                catalog, "_fetch_catalog",
                return_value=self.sample(with_video=False),
            ),
            patch("mv_uploads.save_catalog") as save,
        ):
            with self.assertRaises(RuntimeError):
                sync_full_uploads()

        save.assert_not_called()
        self.assertIsNone(catalog._cache)

    def test_database_error_preserves_previous_cache(self):
        old = self.sample()
        catalog._cache = old

        with (
            patch.object(
                catalog, "_configuration",
                return_value=("key", "channel", []),
            ),
            patch.object(
                catalog, "_fetch_catalog",
                return_value=self.sample(),
            ),
            patch(
                "mv_uploads.save_catalog",
                side_effect=OSError("simulated database error"),
            ),
        ):
            with self.assertRaises(OSError):
                sync_full_uploads()

        self.assertIs(catalog._cache, old)


if __name__ == "__main__":
    unittest.main()
