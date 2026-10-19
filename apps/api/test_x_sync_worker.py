"""Offline X synchronization tests with PostgreSQL rollback."""

import unittest

from sqlalchemy import text
from sqlalchemy.orm import Session

from database.session import create_db_engine
from services.x_sync_worker import sync_x_pages

AUTHOR = "123456789"
SOURCE = "x_ado"
TEST_ID = "9000000000000000101"


def post(post_id, **changes):
    result = {
        "id": str(post_id),
        "author_id": AUTHOR,
        "text": "Ado offline test",
        "created_at": "2026-10-18T12:00:00Z",
    }
    result.update(changes)
    return result


class XSyncDatabaseTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_db_engine()
        self.connection = self.engine.connect()
        self.transaction = self.connection.begin()
        self.session = Session(bind=self.connection, autoflush=False)

    def tearDown(self):
        self.session.close()
        if self.transaction.is_active:
            self.transaction.rollback()
        self.connection.close()
        self.engine.dispose()

    def count_test_articles(self):
        return self.session.execute(text(
            "SELECT count(*) FROM news_articles "
            "WHERE source_code = :source "
            "AND external_id = :external_id"
        ), {
            "source": SOURCE,
            "external_id": TEST_ID,
        }).scalar_one()

    def test_original_and_checkpoint(self):
        result = sync_x_pages(
            self.session, SOURCE, AUTHOR,
            [[
                post(TEST_ID),
                post("9000000000000000102",
                     referenced_tweets=[
                         {"type": "retweeted", "id": "50"}
                     ]),
                post("9000000000000000103",
                     referenced_tweets=[
                         {"type": "quoted", "id": "51"}
                     ]),
                post("9000000000000000104",
                     referenced_tweets=[
                         {"type": "replied_to", "id": "52"}
                     ]),
            ]],
            complete=True,
        )
        self.assertEqual(result["written"], 1)
        self.assertEqual(
            result["since_id"], "9000000000000000104"
        )
        self.assertEqual(self.count_test_articles(), 1)

    def test_incomplete_pages_rejected(self):
        with self.assertRaises(ValueError):
            sync_x_pages(
                self.session, SOURCE, AUTHOR,
                [[post(TEST_ID)]],
                complete=False,
            )
        self.assertEqual(self.count_test_articles(), 0)

    def test_invalid_later_page_rejected(self):
        with self.assertRaises(ValueError):
            sync_x_pages(
                self.session, SOURCE, AUTHOR,
                [[post(TEST_ID)], [None]],
                complete=True,
            )
        self.assertEqual(self.count_test_articles(), 0)

    def test_transaction_rollback(self):
        sync_x_pages(
            self.session, SOURCE, AUTHOR,
            [[post(TEST_ID)]],
            complete=True,
        )
        self.assertEqual(self.count_test_articles(), 1)

        # Roll back the outer connection transaction used by this test.
        self.session.close()
        self.transaction.rollback()

        with self.engine.connect() as connection:
            count = connection.execute(text(
                "SELECT count(*) FROM news_articles "
                "WHERE source_code = :source "
                "AND external_id = :external_id"
            ), {
                "source": SOURCE,
                "external_id": TEST_ID,
            }).scalar_one()

        self.assertEqual(count, 0)


    def test_repeated_sync_is_idempotent(self):
        pages = [[post(TEST_ID)]]

        first = sync_x_pages(
            self.session, SOURCE, AUTHOR, pages, complete=True
        )
        second = sync_x_pages(
            self.session, SOURCE, AUTHOR, pages, complete=True
        )

        self.assertEqual(first["written"], 1)
        self.assertEqual(second["written"], 0)
        self.assertEqual(self.count_test_articles(), 1)
        self.assertEqual(second["since_id"], TEST_ID)

    def test_old_posts_do_not_move_checkpoint_backwards(self):
        newer = "9000000000000000200"

        first = sync_x_pages(
            self.session, SOURCE, AUTHOR,
            [[post(newer)]], complete=True
        )
        second = sync_x_pages(
            self.session, SOURCE, AUTHOR,
            [[post(TEST_ID)]], complete=True
        )

        self.assertEqual(first["since_id"], newer)
        self.assertEqual(second["since_id"], newer)
        self.assertEqual(second["written"], 0)
        self.assertEqual(self.count_test_articles(), 0)

    def test_excluded_posts_advance_checkpoint(self):
        excluded_id = "9000000000000000300"

        result = sync_x_pages(
            self.session, SOURCE, AUTHOR,
            [[post(
                excluded_id,
                referenced_tweets=[
                    {"type": "retweeted", "id": "500"}
                ],
            )]],
            complete=True,
        )

        self.assertEqual(result["written"], 0)
        self.assertEqual(result["since_id"], excluded_id)
        self.assertEqual(self.count_test_articles(), 0)

    def test_unexpected_author_rejects_batch(self):
        with self.assertRaises(ValueError):
            sync_x_pages(
                self.session, SOURCE, AUTHOR,
                [[
                    post(TEST_ID),
                    post(
                        "9000000000000000400",
                        author_id="999999999",
                    ),
                ]],
                complete=True,
            )

        self.assertEqual(self.count_test_articles(), 0)

if __name__ == "__main__":
    unittest.main()
