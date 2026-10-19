"""Offline tests for All News PostgreSQL outage fallback."""

import unittest
from unittest.mock import patch

from services import news_service


class AllNewsPostgresOutageTests(unittest.TestCase):

    def setUp(self):
        self.previous_snapshot = news_service._youtube_history_snapshot
        self.addCleanup(self.restore_snapshot)

    def restore_snapshot(self):
        news_service._youtube_history_snapshot = self.previous_snapshot

    def initialize(self, loader_result=None, loader_error=None):
        with (
            patch(
                "services.youtube_news_catalog.load_all_youtube_news",
                return_value=loader_result,
                side_effect=loader_error,
            ),
            patch(
                "services.news_service.list_fanclub_history",
                return_value=([], 0),
            ) as fanclub,
            patch(
                "services.news_service.list_universal_history",
                return_value=([], 0),
            ) as universal,
        ):
            sources, totals = news_service._all_initialize()

        fanclub.assert_called_once()
        universal.assert_called_once()

        return sources, totals

    def test_success_updates_snapshot(self):
        news_service._youtube_history_snapshot = None

        with patch(
            "services.news_service.monotonic",
            return_value=1000.0,
        ):
            sources, totals = self.initialize(
                loader_result=["video-1", "video-2"],
            )

        self.assertEqual(sources["youtube"], ["video-1", "video-2"])
        self.assertEqual(totals["youtube"], 2)
        self.assertEqual(
            news_service._youtube_history_snapshot,
            (1000.0, ["video-1", "video-2"]),
        )

    def test_outage_uses_recent_snapshot(self):
        news_service._youtube_history_snapshot = (
            1000.0,
            ["video-1"],
        )

        with patch(
            "services.news_service.monotonic",
            return_value=1200.0,
        ):
            sources, totals = self.initialize(
                loader_error=ConnectionError("PG unavailable"),
            )

        self.assertEqual(sources["youtube"], ["video-1"])
        self.assertEqual(totals["youtube"], 1)

    def test_outage_without_snapshot_keeps_other_sources(self):
        news_service._youtube_history_snapshot = None

        sources, totals = self.initialize(
            loader_error=ConnectionError("PG unavailable"),
        )

        self.assertEqual(sources["youtube"], [])
        self.assertEqual(totals["youtube"], 0)
        self.assertIn("fanclub", sources)
        self.assertIn("universal", sources)

    def test_expired_snapshot_is_not_served(self):
        news_service._youtube_history_snapshot = (
            1000.0,
            ["old-video"],
        )

        expired_at = (
            1000.0
            + news_service.YOUTUBE_HISTORY_STALE_SECONDS
            + 1.0
        )

        with patch(
            "services.news_service.monotonic",
            return_value=expired_at,
        ):
            sources, totals = self.initialize(
                loader_error=ConnectionError("PG unavailable"),
            )

        self.assertEqual(sources["youtube"], [])
        self.assertEqual(totals["youtube"], 0)


if __name__ == "__main__":
    unittest.main()
