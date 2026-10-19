"""Offline regression tests for merging All News search results."""

import unittest
from datetime import datetime, timedelta, timezone

from models import NewsCategory, NewsItem


BASE = datetime(2026, 10, 18, tzinfo=timezone.utc)


def item(item_id, title, minutes, source="YouTube - Ado"):
    return NewsItem(
        id=item_id,
        title=title,
        summary="",
        category=NewsCategory.MEDIA,
        source_name=source,
        source_url="https://example.com/" + item_id,
        published_at=BASE - timedelta(minutes=minutes),
        language="ja",
        image_url=None,
    )


class AllNewsSearchMergeTests(unittest.TestCase):

    def test_expected_merge_behavior(self):
        # Existing YouTube article should win over MV metadata.
        articles = [
            item("youtube-1", "Official Raven Sky", 1),
            item("umj-1", "Raven Sky release", 3, "UNIVERSAL MUSIC JAPAN"),
        ]

        videos = [
            item("youtube-1", "Older metadata title", 1),
            item("youtube-2", "Raven Sky Live", 2),
        ]

        merged = {entry.id: entry for entry in videos}
        merged.update({entry.id: entry for entry in articles})

        results = sorted(
            (
                entry for entry in merged.values()
                if "raven sky" in entry.title.casefold()
            ),
            key=lambda entry: (entry.published_at, entry.id),
            reverse=True,
        )

        self.assertEqual(len(results), 3)
        self.assertEqual(
            [entry.id for entry in results],
            ["youtube-1", "youtube-2", "umj-1"],
        )
        self.assertEqual(results[0].title, "Official Raven Sky")


if __name__ == "__main__":
    unittest.main()
