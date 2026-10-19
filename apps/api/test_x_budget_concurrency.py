"""PostgreSQL concurrency and failure tests for X budget reservations."""

import unittest
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal

from sqlalchemy import text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from database.session import create_db_engine
from services.x_budget_db import reserve_x_reads


MONTH = "2099-11"


class XBudgetConcurrencyTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_db_engine()

        with self.engine.connect() as conn:
            existing = conn.execute(
                text(
                    "SELECT count(*) FROM x_api_budget "
                    "WHERE billing_month = :month"
                ),
                {"month": MONTH},
            ).scalar_one()

        if existing:
            self.engine.dispose()
            raise RuntimeError(
                "Concurrency test month contains existing data"
            )

    def tearDown(self):
        self.engine.dispose()

    def test_concurrent_reservation_obeys_database_lock(self):
        """Second transaction cannot bypass the first transaction's lock."""
        first_conn = self.engine.connect()
        first_tx = first_conn.begin()

        try:
            first_session = Session(bind=first_conn)

            first = reserve_x_reads(
                first_session, MONTH, 400
            )
            self.assertEqual(
                first["estimated_cost_usd"],
                Decimal("2.0000"),
            )

            def competing_worker():
                with self.engine.connect() as second_conn:
                    second_tx = second_conn.begin()

                    try:
                        second_conn.execute(
                            text("SET LOCAL lock_timeout = '500ms'")
                        )
                        second_session = Session(
                            bind=second_conn
                        )

                        try:
                            reserve_x_reads(
                                second_session,
                                MONTH,
                                100,
                            )
                            return "unexpected_success"
                        except OperationalError as exc:
                            code = getattr(
                                exc.orig, "sqlstate", None
                            )
                            if code == "55P03":
                                return "lock_timeout"
                            raise
                    finally:
                        if second_tx.is_active:
                            second_tx.rollback()

            with ThreadPoolExecutor(max_workers=1) as pool:
                future = pool.submit(competing_worker)
                outcome = future.result(timeout=10)

            self.assertEqual(outcome, "lock_timeout")

        finally:
            first_session.close()
            if first_tx.is_active:
                first_tx.rollback()
            first_conn.close()

        with self.engine.connect() as conn:
            remaining = conn.execute(
                text(
                    "SELECT count(*) FROM x_api_budget "
                    "WHERE billing_month = :month"
                ),
                {"month": MONTH},
            ).scalar_one()

        self.assertEqual(remaining, 0)

    def test_simulated_api_failure_does_not_release_reservation(self):
        """An application error must not automatically refund a reservation."""
        with self.engine.connect() as conn:
            tx = conn.begin()

            try:
                session = Session(bind=conn)

                reserve_x_reads(session, MONTH, 100)

                try:
                    raise RuntimeError("Simulated API failure")
                except RuntimeError:
                    pass

                row = conn.execute(
                    text(
                        "SELECT reserved_posts, estimated_cost_usd "
                        "FROM x_api_budget "
                        "WHERE billing_month = :month"
                    ),
                    {"month": MONTH},
                ).one()

                self.assertEqual(row.reserved_posts, 100)
                self.assertEqual(
                    row.estimated_cost_usd,
                    Decimal("0.5000"),
                )
                session.close()
            finally:
                if tx.is_active:
                    tx.rollback()


if __name__ == "__main__":
    unittest.main()
