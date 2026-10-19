"""Offline tests for conservative X read budgeting."""

import unittest
from decimal import Decimal

from services.x_budget import XReadBudget, XBudgetExceeded


class XBudgetTests(unittest.TestCase):
    def test_default_monthly_allowance(self):
        budget = XReadBudget()
        self.assertEqual(budget.monthly_limit, Decimal("2.25"))
        self.assertEqual(budget.reserved_posts, 0)

    def test_reserve_100_posts(self):
        budget = XReadBudget()
        budget.reserve(100)
        self.assertEqual(budget.reserved_cost, Decimal("0.500"))

    def test_exact_limit_allowed(self):
        budget = XReadBudget()
        budget.reserve(450)
        self.assertEqual(budget.remaining, Decimal("0.000"))

    def test_budget_exceeded_blocks_request(self):
        budget = XReadBudget()
        budget.reserve(400)
        with self.assertRaises(XBudgetExceeded):
            budget.reserve(51)
        self.assertEqual(budget.reserved_posts, 400)

    def test_invalid_request_rejected(self):
        budget = XReadBudget()
        for value in (0, -1, 1.5, True):
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    budget.reserve(value)


if __name__ == "__main__":
    unittest.main()
