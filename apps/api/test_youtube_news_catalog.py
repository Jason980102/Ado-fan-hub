"""Offline regression tests for merged YouTube News catalog."""

import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from models import NewsCategory
from news_sources.youtube import CHANNEL_ID
from services.youtube_news_catalog import list_youtube_catalog


class YouTubeNewsCatalogTests(unittest.TestCase):

    def setUp(self):
        self.now = datetime(2026, 10, 18, tzinfo=timezone.utc)

    def video(self, vid, days=0, channel=CHANNEL_ID):
        return SimpleNamespace(
            youtube_id=vid,
            title="MV " + vid,
            channel_id=channel,
            published_at=self.now - timedelta(days=days),
            thumbnail_url=None,
        )

    def article(self, vid, title="Original News"):
        return SimpleNamespace(
            external_id="youtube-" + vid,
            title=title,
            summary="Original description",
            category="media",
            source_url="https://www.youtube.com/watch?v=" + vid,
            published_at=self.now,
            language="ja",
            image_url=None,
        )

    def merged(self, videos, articles, **kwargs):
        engine = MagicMock()
        engine.dialect.name = "postgresql"

        session = MagicMock()
        # SQLAlchemy scalars() returns a ScalarResult with .all().
        article_result = MagicMock()
        article_result.all.return_value = articles

        video_result = MagicMock()
        video_result.all.return_value = videos

        def execute_scalars(statement):
            # Inspect the actual SQL filter. A MagicMock does not
            # execute WHERE clauses, so emulate that filtering.
            compiled = statement.compile()
            sql = str(compiled)
            parameters = compiled.params

            if "music_videos" in sql:
                if "channel_id" not in sql:
                    raise AssertionError(
                        "Missing official channel SQL filter"
                    )
                if CHANNEL_ID not in parameters.values():
                    raise AssertionError(
                        "Incorrect official channel filter"
                    )

                video_result.all.return_value = [
                    video for video in videos
                    if video.channel_id == CHANNEL_ID
                ]
                return video_result

            if "news_articles" in sql:
                return article_result

            raise AssertionError("Unexpected SQL statement")

        session.scalars.side_effect = execute_scalars

        factory = MagicMock()
        factory.return_value.__enter__.return_value = session

        with (
            patch(
                "services.youtube_news_catalog.create_db_engine",
                return_value=engine,
            ),
            patch(
                "services.youtube_news_catalog.create_session_factory",
                return_value=factory,
            ),
        ):
            result = list_youtube_catalog(**kwargs)

        engine.dispose.assert_called_once()
        return result

    def test_article_takes_precedence(self):
        result = self.merged(
            [self.video("aaaaaaaaaaa")],
            [self.article("aaaaaaaaaaa")],
        )

        self.assertEqual(result.total, 1)
        self.assertEqual(result.items[0].title, "Original News")
        self.assertEqual(
            result.items[0].summary,
            "Original description",
        )

    def test_official_video_only(self):
        result = self.merged(
            [
                self.video("aaaaaaaaaaa"),
                self.video(
                    "bbbbbbbbbbb",
                    channel="UC_OTHER_CHANNEL",
                ),
            ],
            [],
        )

        self.assertEqual(result.total, 1)
        self.assertEqual(
            result.items[0].id,
            "youtube-aaaaaaaaaaa",
        )

    def test_title_search(self):
        result = self.merged(
            [
                self.video("aaaaaaaaaaa"),
                self.video("bbbbbbbbbbb"),
            ],
            [],
            query="AAAAAAAAAAA",
        )

        self.assertEqual(result.total, 1)
        self.assertEqual(
            result.items[0].id,
            "youtube-aaaaaaaaaaa",
        )

    def test_category_filter(self):
        result = self.merged(
            [self.video("aaaaaaaaaaa")],
            [],
            category=NewsCategory.MERCH,
        )

        self.assertEqual(result.total, 0)

    def test_pagination_and_sort(self):
        result = self.merged(
            [
                self.video("aaaaaaaaaaa", days=2),
                self.video("bbbbbbbbbbb", days=0),
                self.video("ccccccccccc", days=1),
            ],
            [],
            limit=1,
            offset=1,
        )

        self.assertEqual(result.total, 3)
        self.assertEqual(
            result.items[0].id,
            "youtube-ccccccccccc",
        )


if __name__ == "__main__":
    unittest.main()
