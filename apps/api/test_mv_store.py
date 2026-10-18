import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from mv_catalog import CatalogResponse, CatalogSource
from mv_store import (
    get_store_status,
    load_catalog,
    save_catalog,
)


class MVStoreTests(unittest.TestCase):

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)

        self.db_path = (
            Path(self.temp.name) / "data" / "mv_catalog.sqlite3"
        )

    def make_catalog(self, partial=False):
        return CatalogResponse(
            fetched_at=datetime.now(timezone.utc),
            partial=partial,
            sources=[
                CatalogSource(
                    id="official",
                    title="Ado official uploads",
                    available=True,
                    item_count=1,
                )
            ],
            videos=[],
            unavailable_video_ids=[],
        )

    def test_empty_database(self):
        self.assertIsNone(load_catalog(self.db_path))
        self.assertFalse(
            get_store_status(self.db_path)["has_snapshot"]
        )

    def test_save_and_reload(self):
        original = self.make_catalog()

        save_catalog(original, self.db_path)
        loaded = CatalogResponse.model_validate(
            load_catalog(self.db_path)
        )

        self.assertEqual(
            loaded.fetched_at,
            original.fetched_at,
        )
        self.assertEqual(len(loaded.sources), 1)
        self.assertTrue(
            get_store_status(self.db_path)["has_snapshot"]
        )

    def test_partial_result_cannot_replace_good_data(self):
        good = self.make_catalog()
        save_catalog(good, self.db_path)

        with self.assertRaises(ValueError):
            save_catalog(
                self.make_catalog(partial=True),
                self.db_path,
            )

        loaded = CatalogResponse.model_validate(
            load_catalog(self.db_path)
        )

        self.assertFalse(loaded.partial)
        self.assertEqual(
            loaded.fetched_at,
            good.fetched_at,
        )

    def test_latest_complete_snapshot_replaces_previous(self):
        first = self.make_catalog()
        save_catalog(first, self.db_path)

        second = self.make_catalog()
        second.sources[0].item_count = 775
        save_catalog(second, self.db_path)

        loaded = CatalogResponse.model_validate(
            load_catalog(self.db_path)
        )

        self.assertEqual(loaded.sources[0].item_count, 775)


if __name__ == "__main__":
    unittest.main()
