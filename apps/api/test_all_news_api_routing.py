"""Offline API routing regression tests for News sources."""

import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from main import app
from models import NewsListResponse


EMPTY = NewsListResponse(items=[], total=0)


class AllNewsAPIRoutingTests(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_all_keyword_uses_merged_search(self):
        with patch(
            "services.all_news_search.search_all_news",
            return_value=EMPTY,
        ) as merged:
            response = self.client.get(
                "/api/news?source=all&q=Raven"
            )

        self.assertEqual(response.status_code, 200)
        merged.assert_called_once()
        self.assertEqual(merged.call_args.kwargs["query"], "Raven")

    def test_all_category_uses_merged_search(self):
        with patch(
            "services.all_news_search.search_all_news",
            return_value=EMPTY,
        ) as merged:
            response = self.client.get(
                "/api/news?source=all&category=media"
            )

        self.assertEqual(response.status_code, 200)
        merged.assert_called_once()

    def test_youtube_keeps_existing_catalog(self):
        with (
            patch(
                "services.youtube_news_catalog.list_youtube_catalog",
                return_value=EMPTY,
            ) as youtube,
            patch(
                "services.all_news_search.search_all_news",
                return_value=EMPTY,
            ) as merged,
        ):
            response = self.client.get(
                "/api/news?source=youtube&q=Raven"
            )

        self.assertEqual(response.status_code, 200)
        youtube.assert_called_once()
        merged.assert_not_called()

    def test_x_keeps_existing_search(self):
        with (
            patch(
                "services.news_service.search_news_titles",
                return_value=EMPTY,
            ) as existing,
            patch(
                "services.all_news_search.search_all_news",
                return_value=EMPTY,
            ) as merged,
        ):
            response = self.client.get(
                "/api/news?source=x&q=Ado"
            )

        self.assertEqual(response.status_code, 200)
        existing.assert_called_once()
        merged.assert_not_called()


if __name__ == "__main__":
    unittest.main()
