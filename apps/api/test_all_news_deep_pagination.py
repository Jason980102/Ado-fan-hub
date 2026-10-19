"""Offline cross-source All News pagination regression tests."""

import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from models import NewsCategory, NewsItem
from services import news_service


class AllNewsDeepPaginationTests(unittest.TestCase):

    def setUp(self):
        self.saved = (
            news_service._all_history_sources,
            news_service._all_history_totals,
            news_service._all_history_expires_at,
        )
        self.addCleanup(self.restore)

        news_service._all_history_sources = None
        news_service._all_history_totals = None
        news_service._all_history_expires_at = 0.0

    def restore(self):
        (
            news_service._all_history_sources,
            news_service._all_history_totals,
            news_service._all_history_expires_at,
        ) = self.saved

    def make_items(self, name, count, start=0, step=3):
        now = datetime(2026, 10, 18, tzinfo=timezone.utc)

        return [
            NewsItem(
                id=f"{name}-{i:04d}",
                title=f"{name} item {i}",
                summary="",
                category=NewsCategory.MEDIA,
                source_name=name,
                source_url=(
                    "https://example.com/"
                    + name.lower().replace(" ", "-")
                    + f"/{i}"
                ),
                published_at=now - timedelta(
                    hours=start + i * step
                ),
                language="ja",
                image_url=None,
            )
            for i in range(count)
        ]

    def test_deep_pagination_matches_global_sort(self):
        youtube = self.make_items(
            "YouTube", 120, start=1, step=4
        )
        fanclub = self.make_items(
            "Fanclub", 150, start=0, step=3
        )
        universal = self.make_items(
            "Universal", 130, start=2, step=5
        )

        sources = {
            "youtube": youtube,
            "fanclub": fanclub[:60],
            "universal": universal[:100],
        }
        totals = {
            "youtube": len(youtube),
            "fanclub": len(fanclub),
            "universal": len(universal),
        }

        def fake_initialize():
            return {
                name: list(items)
                for name, items in sources.items()
            }, dict(totals)

        def fake_fanclub(offset, limit):
            return (
                fanclub[offset:offset + limit],
                len(fanclub),
            )

        def fake_universal(offset, limit):
            return (
                universal[offset:offset + limit],
                len(universal),
            )

        with (
            patch.object(
                news_service,
                "_all_initialize",
                side_effect=fake_initialize,
            ),
            patch.object(
                news_service,
                "list_fanclub_history",
                side_effect=fake_fanclub,
            ),
            patch.object(
                news_service,
                "list_universal_history",
                side_effect=fake_universal,
            ),
        ):
            observed = []

            for offset in range(0, 400, 20):
                batch, reported_total = (
                    news_service.list_all_news_history(
                        offset=offset,
                        limit=20,
                    )
                )
                observed.extend(batch)

        expected = news_service._all_sorted_items({
            "youtube": youtube,
            "fanclub": fanclub,
            "universal": universal,
        })

        self.assertEqual(len(expected), 400)
        self.assertEqual(
            [item.id for item in observed],
            [item.id for item in expected],
        )
        self.assertEqual(reported_total, 400)


if __name__ == "__main__":
    unittest.main()
