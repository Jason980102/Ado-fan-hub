"""Offline SQL regression tests for unified All News search."""

import unittest

from sqlalchemy.dialects import postgresql

from models import NewsCategory
from services.all_news_search import (
    _search_statement,
    search_all_news,
)


def compile_sql(category=None, query=""):
    statement = _search_statement(category, query)
    return str(
        statement.compile(
            dialect=postgresql.dialect(),
            compile_kwargs={"literal_binds": True},
        )
    ).lower()


class AllNewsSearchSQLTests(unittest.TestCase):

    def test_union_includes_both_tables(self):
        sql = compile_sql()
        self.assertIn("union all", sql)
        self.assertIn("news_articles", sql)
        self.assertIn("music_videos", sql)

    def test_only_official_youtube_channel(self):
        sql = compile_sql()
        self.assertIn("channel_id", sql)
        self.assertIn("ucln9p4qm3-eay4aiepmrwea", sql)

    def test_existing_youtube_article_deduplication(self):
        sql = compile_sql()
        self.assertIn("not (exists", sql)
        self.assertIn("youtube-", sql)
        self.assertIn("external_id", sql)

    def test_source_active_filter(self):
        sql = compile_sql()
        self.assertIn("is_active is true", sql)

    def test_category_filter(self):
        sql = compile_sql(NewsCategory.MEDIA)
        self.assertIn("media", sql)
        self.assertIn("category", sql)

    def test_keyword_filter(self):
        sql = compile_sql(query="Raven Sky")
        self.assertIn("raven sky", sql)
        self.assertIn("ilike", sql)

    def test_search_limit_validation_without_database(self):
        with self.assertRaises(ValueError):
            search_all_news(
                category=None,
                limit=0,
                offset=0,
                query="",
            )

    def test_search_offset_validation_without_database(self):
        with self.assertRaises(ValueError):
            search_all_news(
                category=None,
                limit=20,
                offset=-1,
                query="",
            )

    def test_search_query_validation_without_database(self):
        with self.assertRaises(ValueError):
            search_all_news(
                category=None,
                limit=20,
                offset=0,
                query="a" * 101,
            )


if __name__ == "__main__":
    unittest.main()
