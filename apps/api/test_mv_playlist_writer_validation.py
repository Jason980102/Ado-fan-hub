"""Offline negative tests for MV playlist writer validation."""

import unittest
from unittest.mock import patch

from mv_catalog import CatalogSource, SOURCES
from services.mv_playlist_writer import save_playlist_memberships


class PlaylistWriterValidationTests(unittest.TestCase):

    def valid_inputs(self):
        memberships = {
            pid: set()
            for pid in SOURCES
        }
        sources = {
            pid: CatalogSource(
                id=pid,
                title=title,
                available=True,
                item_count=0,
            )
            for pid, (title, _) in SOURCES.items()
        }
        return memberships, sources

    def assert_rejected_before_db(self, memberships, sources):
        with patch(
            "services.mv_playlist_writer.create_db_engine"
        ) as engine:
            with self.assertRaises(ValueError):
                save_playlist_memberships(memberships, sources)
            engine.assert_not_called()

    def test_invalid_video_id(self):
        memberships, sources = self.valid_inputs()
        pid = next(iter(SOURCES))
        memberships[pid].add("invalid-video-id")
        sources[pid].item_count = 1
        self.assert_rejected_before_db(memberships, sources)

    def test_memberships_must_be_set(self):
        memberships, sources = self.valid_inputs()
        pid = next(iter(SOURCES))
        memberships[pid] = []
        self.assert_rejected_before_db(memberships, sources)

    def test_source_id_must_match_key(self):
        memberships, sources = self.valid_inputs()
        pid = next(iter(SOURCES))
        sources[pid].id = "wrong-source"
        self.assert_rejected_before_db(memberships, sources)

    def test_unavailable_source_rejected(self):
        memberships, sources = self.valid_inputs()
        pid = next(iter(SOURCES))
        sources[pid].available = False
        self.assert_rejected_before_db(memberships, sources)

    def test_incorrect_item_count_rejected(self):
        memberships, sources = self.valid_inputs()
        pid = next(iter(SOURCES))
        sources[pid].item_count = 5
        self.assert_rejected_before_db(memberships, sources)


if __name__ == "__main__":
    unittest.main()
