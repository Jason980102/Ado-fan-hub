"""Offline regression tests for full YouTube history in All News."""

import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from models import NewsCategory, NewsItem
from services import news_service


class AllNewsYouTubeHistoryTests(unittest.TestCase):

    def item(self, vid, days, source="YouTube - Ado"):
        now = datetime(2026, 10, 18, tzinfo=timezone.utc)

        return NewsItem(
            id="youtube-" + vid,
            title="News " + vid,
            summary="",
            category=NewsCategory.MEDIA,
            source_name=source,
            source_url="https://www.youtube.com/watch?v=" + vid,
            published_at=now - timedelta(days=days),
            language="ja",
            image_url=None,
        )

    def test_initialize_loads_full_youtube_once(self):
        # A synthetic catalog larger than the RSS limit of 15.
        youtube = [
            self.item(f"{i:011d}", i)
            for i in range(40)
        ]

        fanclub = [self.item("fanclub000", 1, "Ado Fan Club News")]
        universal = [
            self.item("universal00", 2, "UNIVERSAL MUSIC JAPAN")
        ]

        with (
            patch(
                "services.youtube_news_catalog.load_all_youtube_news",
                return_value=youtube,
            ) as loader,
            patch(
                "services.news_service.list_fanclub_history",
                return_value=(fanclub, 1),
            ),
            patch(
                "services.news_service.list_universal_history",
                return_value=(universal, 1),
            ),
            patch(
                "services.news_service.get_cached_news",
                side_effect=AssertionError(
                    "All News must not use RSS as YouTube history"
                ),
            ),
        ):
            sources, totals = news_service._all_initialize()

        loader.assert_called_once_with()
        self.assertEqual(len(sources["youtube"]), 40)
        self.assertEqual(totals["youtube"], 40)

        self.assertEqual(len(sources["fanclub"]), 1)
        self.assertEqual(len(sources["universal"]), 1)

        merged = news_service._all_sorted_items(sources)

        self.assertEqual(len(merged), 42)
        self.assertEqual(
            merged[0].id,
            "youtube-00000000000",
        )

    def test_youtube_duplicates_are_removed_in_all_news(self):
        video = self.item("aaaaaaaaaaa", 0)
        sources = {
            "youtube": [video, video],
            "fanclub": [],
            "universal": [],
        }

        merged = news_service._all_sorted_items(sources)

        self.assertEqual(len(merged), 1)


if __name__ == "__main__":
    unittest.main()
