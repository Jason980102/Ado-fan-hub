"""Verify committed X budget reservations survive new DB connections.

Uses an isolated test month, and deletes only its own test row.
No API requests.
"""

import unittest
from decimal import Decimal

from sqlalchemy import text
from sqlalchemy.orm import Session

from database.session import create_db_engine
from services.x_budget import XBudgetExceeded
from services.x_budget_db import reserve_x_reads


MONTH = "2099-10"


class XBudgetPersistenceTests(unittest.TestCase):
    def test_committed_reservation_survives_reconnect(self):
        engine = create_db_engine()
        created = False

        try:
            with engine.connect() as conn:
                existing = conn.execute(
                    text(
                        "SELECT COUNT(*) FROM x_api_budget "
                        "WHERE billing_month = :month"
                    ),
                    {"month": MONTH},
                ).scalar_one()

            if existing:
                self.fail("Test month already contains data")

            with Session(engine) as session:
                first = reserve_x_reads(session, MONTH, 400)
                self.assertEqual(first["reserved_posts"], 400)
                session.commit()
                created = True

            # New session: simulates a subsequent Worker invocation.
            with Session(engine) as session:
                row = session.execute(
                    text(
                        "SELECT reserved_posts, estimated_cost_usd "
                        "FROM x_api_budget "
                        "WHERE billing_month = :month"
                    ),
                    {"month": MONTH},
                ).one()

                self.assertEqual(row.reserved_posts, 400)
                self.assertEqual(
                    row.estimated_cost_usd, Decimal("2.0000")
                )

                with self.assertRaises(XBudgetExceeded):
                    reserve_x_reads(session, MONTH, 100)

                session.rollback()

            with Session(engine) as session:
                row = session.execute(
                    text(
                        "SELECT reserved_posts FROM x_api_budget "
                        "WHERE billing_month = :month"
                    ),
                    {"month": MONTH},
                ).scalar_one()

                self.assertEqual(row, 400)

        finally:
            if created:
                with engine.begin() as conn:
                    result = conn.execute(
                        text(
                            "DELETE FROM x_api_budget "
                            "WHERE billing_month = :month "
                            "AND reserved_posts = 400 "
                            "AND estimated_cost_usd = 2.0000"
                        ),
                        {"month": MONTH},
                    )
                    if result.rowcount != 1:
                        raise AssertionError(
                            "Test cleanup mismatch; inspect budget row"
                        )

            engine.dispose()


if __name__ == "__main__":
    unittest.main()
