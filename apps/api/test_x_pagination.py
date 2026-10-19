"""Offline tests for X API pagination verification."""

import unittest

from news_sources.x_pagination import (
    IncompleteXPagination,
    validate_x_pages,
)


def response(ids, next_token=None):
    meta = {"result_count": len(ids)}
    if next_token is not None:
        meta["next_token"] = next_token
    return {
        "data": [{"id": str(value)} for value in ids],
        "meta": meta,
    }


class XPaginationTests(unittest.TestCase):
    def test_single_terminal_page(self):
        pages = validate_x_pages([
            (None, response([101, 102]))
        ])
        self.assertEqual(len(pages), 1)

    def test_complete_multiple_pages(self):
        pages = validate_x_pages([
            (None, response([103], "token-a")),
            ("token-a", response([102], "token-b")),
            ("token-b", response([101])),
        ])
        self.assertEqual(len(pages), 3)

    def test_missing_last_page_rejected(self):
        with self.assertRaises(IncompleteXPagination):
            validate_x_pages([
                (None, response([103], "token-a"))
            ])

    def test_skipped_page_rejected(self):
        with self.assertRaises(IncompleteXPagination):
            validate_x_pages([
                (None, response([103], "token-a")),
                ("wrong-token", response([102])),
            ])

    def test_token_cycle_rejected(self):
        with self.assertRaises(IncompleteXPagination):
            validate_x_pages([
                (None, response([103], "token-a")),
                ("token-a", response([102], "token-a")),
            ])

    def test_api_error_rejected(self):
        with self.assertRaises(IncompleteXPagination):
            validate_x_pages([
                (None, {
                    "errors": [{"detail": "Rate limited"}],
                    "meta": {"result_count": 0},
                })
            ])

    def test_invalid_count_rejected(self):
        with self.assertRaises(IncompleteXPagination):
            validate_x_pages([
                (None, {
                    "data": [{"id": "101"}],
                    "meta": {"result_count": 2},
                })
            ])

    def test_page_limit_rejected(self):
        with self.assertRaises(IncompleteXPagination):
            validate_x_pages([
                (None, response([103], "token-a")),
                ("token-a", response([102])),
            ], max_pages=1)

    def test_empty_terminal_page(self):
        pages = validate_x_pages([
            (None, {"meta": {"result_count": 0}})
        ])
        self.assertEqual(pages, [[]])

    def test_extra_page_after_terminal_rejected(self):
        with self.assertRaises(IncompleteXPagination):
            validate_x_pages([
                (None, response([101])),
                (None, response([102])),
            ])


if __name__ == "__main__":
    unittest.main()
