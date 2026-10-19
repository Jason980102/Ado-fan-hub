"""Offline tests for the independent official-picks API."""

import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from official_curated_api import router
from services.official_curated_playlist import (
    CuratedPlaylist,
    OFFICIAL_CHANNEL_ID,
    PLAYLIST_ID,
)


class CuratedApiTests(unittest.TestCase):

    def setUp(self):
        app = FastAPI()
        app.include_router(router)
        self.client = TestClient(app)

    def test_snapshot_endpoint(self):
        snapshot = CuratedPlaylist(
            playlist_id=PLAYLIST_ID,
            title="Official picks",
            owner_channel_id=OFFICIAL_CHANNEL_ID,
            videos=[],
        )

        with patch(
            "official_curated_api.load_curated_snapshot",
            return_value=snapshot,
        ) as loader:
            response = self.client.get("/api/mv/official-picks")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json()["playlist_id"],
            PLAYLIST_ID,
        )
        loader.assert_called_once_with()

    def test_unavailable_snapshot_returns_503(self):
        with patch(
            "official_curated_api.load_curated_snapshot",
            side_effect=RuntimeError("private path"),
        ):
            response = self.client.get("/api/mv/official-picks")

        self.assertEqual(response.status_code, 503)
        self.assertNotIn("private path", response.text)


if __name__ == "__main__":
    unittest.main()
