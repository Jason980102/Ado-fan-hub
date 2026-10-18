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
            sources=[
                catalog.CatalogSource(
                    id="official",
                    title="Ado official uploads",
                    available=True,
                    item_count=1,
                ),
            ],
            videos=[
                catalog.CatalogVideo(
                    id="7DBSMzbPQzc",
                    title="Raven Sky",
                    categories=["unclassified"],
                    published_at=datetime.now(timezone.utc),
                    thumbnail_url=None,
                    view_count=100,
                    like_count=10,
                    url=(
                        "https://www.youtube.com/watch?v="
                        "7DBSMzbPQzc"
                    ),
                    channel_id="UCln9P4Qm3-EAY4aiEPmRwEA",
                    channel_title="Ado",
                    playlist_ids=["official"],
                    aliases=[],
                ),
            ],
            unavailable_video_ids=[],
        )

    def test_success_saves_complete_catalog(self):
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
            patch.object(catalog, "save_catalog") as save,
        ):
            response = catalog.mv_catalog()

        self.assertEqual(len(response.videos), 1)
        self.assertFalse(response.cached)
        save.assert_called_once_with(result)

    def test_failed_youtube_restores_sqlite(self):
        saved = self.sample()

        with (
            patch.object(
                catalog, "_configuration",
                return_value=("key", "channel", []),
            ),
            patch.object(
                catalog, "_fetch_catalog",
                side_effect=ValueError("upstream unavailable"),
            ),
            patch.object(
                catalog, "load_catalog",
                return_value=saved.model_dump(mode="json"),
            ),
        ):
            response = catalog.mv_catalog()

        self.assertTrue(response.cached)
        self.assertEqual(
            response.videos[0].id,
            "7DBSMzbPQzc",
        )

    def test_partial_does_not_overwrite_sqlite(self):
        result = self.sample(partial=True)

        with (
            patch.object(
                catalog, "_configuration",
                return_value=("key", "channel", []),
            ),
            patch.object(
                catalog, "_fetch_catalog",
                return_value=result,
            ),
            patch.object(catalog, "save_catalog") as save,
        ):
            response = catalog.mv_catalog()

        self.assertTrue(response.partial)
        save.assert_not_called()

    def test_memory_fallback_precedes_sqlite(self):
        catalog._cache = self.sample()
        catalog._cache_until = 0

        with (
            patch.object(
                catalog, "_configuration",
                side_effect=ValueError("missing config"),
            ),
            patch.object(catalog, "load_catalog") as load,
        ):
            response = catalog.mv_catalog()

        self.assertTrue(response.cached)
        self.assertEqual(len(response.videos), 1)
        load.assert_not_called()

    def test_empty_store_returns_503(self):
        with (
            patch.object(
                catalog, "_configuration",
                side_effect=ValueError("missing config"),
            ),
            patch.object(
                catalog, "load_catalog",
                return_value=None,
            ),
        ):
            with self.assertRaises(catalog.HTTPException) as error:
                catalog.mv_catalog()

        self.assertEqual(error.exception.status_code, 503)


if __name__ == "__main__":
    unittest.main()
