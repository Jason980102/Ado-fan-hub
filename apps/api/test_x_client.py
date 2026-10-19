"""Offline tests for the X API client."""

import unittest

import httpx

from news_sources.x_client import (
    XAPIClientError,
    fetch_x_timeline_records,
)
from news_sources.x_pagination import validate_x_pages


USER_ID = "123456789"


def response(posts, next_token=None):
    meta = {"result_count": len(posts)}
    if next_token is not None:
        meta["next_token"] = next_token
    return {"data": posts, "meta": meta}


def post(identifier):
    return {
        "id": str(identifier),
        "author_id": USER_ID,
        "text": "Ado update",
        "created_at": "2026-10-19T00:00:00Z",
    }


class XClientTests(unittest.TestCase):
    def fetch(self, handler, **kwargs):
        transport = httpx.MockTransport(handler)
        return fetch_x_timeline_records(
            bearer_token="offline-test-token",
            x_user_id=USER_ID,
            transport=transport,
            **kwargs,
        )

    def test_single_page(self):
        def handler(request):
            self.assertEqual(
                request.url.path,
                f"/2/users/{USER_ID}/tweets",
            )
            self.assertEqual(
                request.headers["authorization"],
                "Bearer offline-test-token",
            )
            return httpx.Response(
                200,
                json=response([post(1)]),
            )

        records = self.fetch(handler)
        pages = validate_x_pages(records)
        self.assertEqual(len(pages), 1)
        self.assertEqual(pages[0][0]["id"], "1")

    def test_multiple_pages(self):
        tokens = []

        def handler(request):
            token = request.url.params.get("pagination_token")
            tokens.append(token)

            if token is None:
                return httpx.Response(
                    200,
                    json=response([post(1)], "next-page"),
                )

            return httpx.Response(
                200,
                json=response([post(2)]),
            )

        records = self.fetch(
            handler,
            max_pages=2,
            max_posts=10,
        )

        self.assertEqual(tokens, [None, "next-page"])
        self.assertEqual(len(validate_x_pages(records)), 2)

    def test_http_failure_does_not_retry(self):
        calls = []

        def handler(request):
            calls.append(request)
            return httpx.Response(
                429,
                json={"error": "limit"},
            )

        with self.assertRaises(XAPIClientError):
            self.fetch(handler)

        self.assertEqual(len(calls), 1)

    def test_invalid_credentials_rejected(self):
        with self.assertRaises(ValueError):
            fetch_x_timeline_records(
                bearer_token="",
                x_user_id=USER_ID,
                transport=httpx.MockTransport(
                    lambda _: httpx.Response(200, json={})
                ),
            )

    def test_invalid_user_id_rejected(self):
        with self.assertRaises(ValueError):
            fetch_x_timeline_records(
                bearer_token="offline",
                x_user_id="invalid",
                transport=httpx.MockTransport(
                    lambda _: httpx.Response(200, json={})
                ),
            )

    def test_page_limit_rejected(self):
        def handler(request):
            return httpx.Response(
                200,
                json=response([post(1)], "another-page"),
            )

        with self.assertRaises(XAPIClientError):
            self.fetch(handler, max_pages=1)

    def test_post_budget_exceeded(self):
        def handler(request):
            return httpx.Response(
                200,
                json=response([post(1), post(2), post(3)]),
            )

        with self.assertRaises(XAPIClientError):
            self.fetch(handler, max_posts=2)

    def test_invalid_pagination_metadata(self):
        def handler(request):
            return httpx.Response(
                200,
                json={"data": [post(1)]},
            )

        with self.assertRaises(XAPIClientError):
            self.fetch(handler)

    def test_token_cycle(self):
        def handler(request):
            return httpx.Response(
                200,
                json=response([post(1)], "same-token"),
            )

        with self.assertRaises(XAPIClientError):
            self.fetch(
                handler,
                max_pages=3,
                max_posts=10,
            )


    def test_insufficient_initial_budget(self):
        calls = []

        def handler(request):
            calls.append(request)
            return httpx.Response(200, json=response([]))

        with self.assertRaises(XAPIClientError):
            self.fetch(handler, max_posts=4)

        self.assertEqual(len(calls), 0)

    def test_insufficient_remaining_budget(self):
        calls = []

        def handler(request):
            calls.append(request)
            return httpx.Response(
                200,
                json=response(
                    [post(i) for i in range(7)],
                    "next-page",
                ),
            )

        with self.assertRaises(XAPIClientError):
            self.fetch(
                handler,
                max_pages=2,
                max_posts=10,
            )

        self.assertEqual(len(calls), 1)

    def test_inconsistent_result_count_rejected(self):
        def handler(request):
            return httpx.Response(
                200,
                json={
                    "data": [post(1)],
                    "meta": {"result_count": 2},
                },
            )

        with self.assertRaises(XAPIClientError):
            self.fetch(handler)

    def test_api_payload_error_rejected(self):
        def handler(request):
            return httpx.Response(
                200,
                json={
                    "errors": [{"detail": "API error"}],
                    "meta": {"result_count": 0},
                },
            )

        with self.assertRaises(XAPIClientError):
            self.fetch(handler)


if __name__ == "__main__":
    unittest.main()