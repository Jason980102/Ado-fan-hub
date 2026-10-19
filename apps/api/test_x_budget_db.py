"""PostgreSQL X budget tests with transaction rollback."""

import unittest
from decimal import Decimal

from sqlalchemy import text
from sqlalchemy.orm import Session

from database.session import create_db_engine
from services.x_budget import XBudgetExceeded
from services.x_budget_db import reserve_x_reads


MONTH = "2099-12"


class XBudgetDatabaseTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_db_engine()
        self.connection = self.engine.connect()
        self.transaction = self.connection.begin()
        self.session = Session(
            bind=self.connection,
            autoflush=False,
        )

        existing = self.session.execute(
            text(
                "SELECT count(*) FROM x_api_budget "
                "WHERE billing_month = :month"
            ),
            {"month": MONTH},
        ).scalar_one()

        if existing:
            self.session.close()
            self.transaction.rollback()
            self.connection.close()
            self.engine.dispose()
            raise RuntimeError("Test month already contains data")

    def tearDown(self):
        self.session.close()
        if self.transaction.is_active:
            self.transaction.rollback()
        self.connection.close()
        self.engine.dispose()

    def test_reserve_100_posts(self):
        result = reserve_x_reads(self.session, MONTH, 100)

        self.assertEqual(result["reserved_posts"], 100)
        self.assertEqual(
            result["estimated_cost_usd"], Decimal("0.5000")
        )

    def test_multiple_reservations_accumulate(self):
        reserve_x_reads(self.session, MONTH, 100)
        result = reserve_x_reads(self.session, MONTH, 150)

        self.assertEqual(result["reserved_posts"], 250)
        self.assertEqual(
            result["estimated_cost_usd"], Decimal("1.2500")
        )

    def test_exact_limit_is_allowed(self):
        result = reserve_x_reads(self.session, MONTH, 450)

        self.assertEqual(result["reserved_posts"], 450)
        self.assertEqual(
            result["remaining_usd"], Decimal("0.0000")
        )

    def test_exceeded_limit_rejected_without_change(self):
        reserve_x_reads(self.session, MONTH, 400)

        with self.assertRaises(XBudgetExceeded):
            reserve_x_reads(self.session, MONTH, 51)

        row = self.session.execute(
            text(
                "SELECT reserved_posts, estimated_cost_usd "
                "FROM x_api_budget WHERE billing_month = :month"
            ),
            {"month": MONTH},
        ).one()

        self.assertEqual(row.reserved_posts, 400)
        self.assertEqual(
            row.estimated_cost_usd, Decimal("2.0000")
        )

    def test_single_request_over_limit_rejected(self):
        with self.assertRaises(XBudgetExceeded):
            reserve_x_reads(self.session, MONTH, 451)

        count = self.session.execute(
            text(
                "SELECT count(*) FROM x_api_budget "
                "WHERE billing_month = :month"
            ),
            {"month": MONTH},
        ).scalar_one()

        self.assertEqual(count, 0)

    def test_invalid_input_rejected(self):
        for month, posts in [
            ("bad", 10),
            ("2099-13", 10),
            (MONTH, 0),
            (MONTH, -1),
            (MONTH, True),
            (MONTH, 1.5),
        ]:
            with self.subTest(month=month, posts=posts):
                with self.assertRaises(ValueError):
                    reserve_x_reads(self.session, month, posts)


if __name__ == "__main__":
    unittest.main()
