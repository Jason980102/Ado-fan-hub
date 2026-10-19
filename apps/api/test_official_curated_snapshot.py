"""Offline snapshot-loader tests."""

import json
import tempfile
import unittest
from pathlib import Path

from services.official_curated_playlist import (
    OFFICIAL_CHANNEL_ID,
    PLAYLIST_ID,
)
from services.official_curated_snapshot import load_curated_snapshot


class CuratedSnapshotTests(unittest.TestCase):

    def payload(self):
        return {
            "playlist_id": PLAYLIST_ID,
            "title": "Official picks",
            "owner_channel_id": OFFICIAL_CHANNEL_ID,
            "videos": [{
                "id": "Ln_j_CscKNw",
                "title": "Third-party cover",
                "channel_id": "UC-mDvk_E0g7QWV1YLQr3LCA",
                "channel_title": "Creator",
                "thumbnail_url": None,
                "url": "https://www.youtube.com/watch?v=Ln_j_CscKNw",
            }],
        }

    def load(self, payload):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "snapshot.json"
            path.write_text(json.dumps(payload), encoding="utf-8")
            return load_curated_snapshot(path)

    def test_valid_snapshot(self):
        result = self.load(self.payload())
        self.assertEqual(len(result.videos), 1)

    def test_wrong_owner_rejected(self):
        payload = self.payload()
        payload["owner_channel_id"] = "wrong"
        with self.assertRaises(RuntimeError):
            self.load(payload)

    def test_duplicate_video_rejected(self):
        payload = self.payload()
        payload["videos"].append(dict(payload["videos"][0]))
        with self.assertRaises(RuntimeError):
            self.load(payload)

    def test_official_upload_rejected(self):
        payload = self.payload()
        payload["videos"][0]["channel_id"] = OFFICIAL_CHANNEL_ID
        with self.assertRaises(RuntimeError):
            self.load(payload)

    def test_missing_file_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(RuntimeError):
                load_curated_snapshot(Path(directory) / "missing.json")


if __name__ == "__main__":
    unittest.main()
