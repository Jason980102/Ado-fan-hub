"""Offline X API read-budget calculator.

No network requests or payment actions.
This is an in-memory simulator, NOT a production billing guard.
"""

from decimal import Decimal


class XBudgetExceeded(ValueError):
    pass


class XReadBudget:
    """Conservatively reserve capacity for requested post reads."""

    def __init__(
        self,
        monthly_limit="2.25",
        estimated_post_price="0.005",
    ):
        self.monthly_limit = Decimal(str(monthly_limit))
        self.post_price = Decimal(str(estimated_post_price))
        self.reserved_posts = 0

        if not self.monthly_limit.is_finite() or self.monthly_limit <= 0:
            raise ValueError("Invalid monthly limit")
        if not self.post_price.is_finite() or self.post_price <= 0:
            raise ValueError("Invalid post price")

    @property
    def reserved_cost(self):
        return self.post_price * self.reserved_posts

    @property
    def remaining(self):
        return self.monthly_limit - self.reserved_cost

    def reserve(self, max_posts):
        """Reserve estimated read capacity before a request."""
        if type(max_posts) is not int or max_posts < 1:
            raise ValueError("max_posts must be a positive integer")

        projected = self.reserved_cost + self.post_price * max_posts

        if projected > self.monthly_limit:
            raise XBudgetExceeded(
                "Estimated X read budget exhausted; request blocked"
            )

        self.reserved_posts += max_posts
        return self.remaining
