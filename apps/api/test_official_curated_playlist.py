"""Offline validation tests for the separate curated playlist."""

import unittest

from services.official_curated_playlist import (
    OFFICIAL_CHANNEL_ID,
    PLAYLIST_ID,
    build_curated_playlist,
)


class CuratedPlaylistTests(unittest.TestCase):

    def inputs(self):
        metadata = {
            "id": PLAYLIST_ID,
            "snippet": {
                "title": "Official picks",
                "channelId": OFFICIAL_CHANNEL_ID,
            },
        }
        ids = ["Ln_j_CscKNw"]
        items = [{
            "id": ids[0],
            "snippet": {
                "title": "Third-party cover",
                "channelId": "UC-mDvk_E0g7QWV1YLQr3LCA",
                "channelTitle": "Creator",
                "thumbnails": {
                    "high": {
                        "url": "https://i.ytimg.com/vi/Ln_j_CscKNw/hqdefault.jpg"
                    }
                },
            },
            "status": {"privacyStatus": "public"},
        }]
        return metadata, ids, items

    def test_valid_public_creator_video(self):
        metadata, ids, items = self.inputs()
        result = build_curated_playlist(metadata, ids, items)
        self.assertEqual(len(result.videos), 1)
        self.assertEqual(result.videos[0].id, ids[0])
        self.assertEqual(result.owner_channel_id, OFFICIAL_CHANNEL_ID)

    def test_wrong_owner_rejected(self):
        metadata, ids, items = self.inputs()
        metadata["snippet"]["channelId"] = "wrong"
        with self.assertRaises(ValueError):
            build_curated_playlist(metadata, ids, items)

    def test_invalid_video_id_rejected(self):
        metadata, ids, items = self.inputs()
        with self.assertRaises(ValueError):
            build_curated_playlist(metadata, ["invalid"], items)

    def test_private_video_excluded(self):
        metadata, ids, items = self.inputs()
        items[0]["status"]["privacyStatus"] = "private"
        result = build_curated_playlist(metadata, ids, items)
        self.assertEqual(result.videos, [])

    def test_ado_upload_rejected(self):
        metadata, ids, items = self.inputs()
        items[0]["snippet"]["channelId"] = OFFICIAL_CHANNEL_ID
        with self.assertRaises(ValueError):
            build_curated_playlist(metadata, ids, items)

    def test_unexpected_video_metadata_rejected(self):
        metadata, ids, items = self.inputs()
        items[0]["id"] = "abcdefghijk"
        with self.assertRaises(ValueError):
            build_curated_playlist(metadata, ids, items)


if __name__ == "__main__":
    unittest.main()
