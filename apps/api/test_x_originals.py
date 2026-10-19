"""Offline tests for filtering X posts."""

import unittest

from news_sources.x_originals import (
    ACCOUNTS,
    filter_original_posts,
    is_original_post,
)

AUTHOR = "123456789"

def post(post_id="100", **kwargs):
    return {
        "id": post_id,
        "author_id": AUTHOR,
        "text": "Ado original post",
        **kwargs,
    }


class OriginalPostTests(unittest.TestCase):
    def test_three_accounts_configured(self):
        self.assertEqual(len(ACCOUNTS), 3)
        self.assertEqual(ACCOUNTS["x_ado"], "ado1024imokenp")
        self.assertEqual(ACCOUNTS["x_staff"], "ado_staff")
        self.assertEqual(ACCOUNTS["x_fanclub"], "ado_doki2kichi")

    def test_original_accepted(self):
        self.assertTrue(is_original_post(post(), AUTHOR))

    def test_repost_rejected(self):
        item = post(referenced_tweets=[
            {"type": "retweeted", "id": "50"}
        ])
        self.assertFalse(is_original_post(item, AUTHOR))

    def test_reply_rejected(self):
        item = post(referenced_tweets=[
            {"type": "replied_to", "id": "50"}
        ])
        self.assertFalse(is_original_post(item, AUTHOR))

    def test_quote_rejected(self):
        item = post(referenced_tweets=[
            {"type": "quoted", "id": "50"}
        ])
        self.assertFalse(is_original_post(item, AUTHOR))

    def test_reply_field_rejected(self):
        item = post(in_reply_to_user_id="9988")
        self.assertFalse(is_original_post(item, AUTHOR))

    def test_other_author_rejected(self):
        self.assertFalse(is_original_post(post(author_id="9988"), AUTHOR))

    def test_missing_author_rejected(self):
        item = post()
        del item["author_id"]
        self.assertFalse(is_original_post(item, AUTHOR))

    def test_invalid_id_rejected(self):
        self.assertFalse(is_original_post(post(post_id="invalid"), AUTHOR))

    def test_unknown_reference_rejected(self):
        item = post(referenced_tweets=[
            {"type": "unknown", "id": "50"}
        ])
        self.assertFalse(is_original_post(item, AUTHOR))

    def test_duplicate_removed(self):
        items = [post("100"), post("100"), post("101")]
        result = filter_original_posts(items, AUTHOR)
        self.assertEqual([p["id"] for p in result], ["100", "101"])

    def test_mixed_posts(self):
        items = [
            post("100"),
            post("101", referenced_tweets=[
                {"type": "retweeted", "id": "50"}
            ]),
            post("102", referenced_tweets=[
                {"type": "replied_to", "id": "50"}
            ]),
            post("103", referenced_tweets=[
                {"type": "quoted", "id": "50"}
            ]),
            post("104"),
        ]
        result = filter_original_posts(items, AUTHOR)
        self.assertEqual([p["id"] for p in result], ["100", "104"])


if __name__ == "__main__":
    unittest.main()