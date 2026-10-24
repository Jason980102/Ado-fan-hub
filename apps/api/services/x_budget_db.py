"""Atomic PostgreSQL reservation of estimated X API read costs.

No HTTP calls. The caller owns the database transaction.
A real API caller must COMMIT the reservation BEFORE sending a request.
"""

from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy.dialects.postgresql import insert

from database.entities import XApiBudget
from services.x_budget import XBudgetExceeded


INTERNAL_LIMIT = Decimal("2.25")
ESTIMATED_POST_PRICE = Decimal("0.005")


def reserve_x_reads(session, billing_month, max_posts):
    """Reserve estimated read capacity atomically within a transaction.

    Returns new month totals. The caller must commit the transaction.
    This is not an X billing guarantee.
    """
    if not isinstance(billing_month, str):
        raise ValueError("Invalid billing month")

    try:
        parsed = datetime.strptime(billing_month, "%Y-%m")
    except ValueError as exc:
        raise ValueError("Invalid billing month") from exc

    if parsed.strftime("%Y-%m") != billing_month:
        raise ValueError("Invalid billing month")

    if type(max_posts) is not int or max_posts < 1:
        raise ValueError("max_posts must be a positive integer")

    amount = ESTIMATED_POST_PRICE * max_posts

    if amount > INTERNAL_LIMIT:
        raise XBudgetExceeded("Request exceeds internal monthly limit")

    table = XApiBudget.__table__
    proposed_cost = table.c.estimated_cost_usd + amount

    stmt = (
        insert(table)
        .values(
            billing_month=billing_month,
            reserved_posts=max_posts,
            estimated_cost_usd=amount,
            updated_at=datetime.now(timezone.utc),
        )
        .on_conflict_do_update(
            index_elements=[table.c.billing_month],
            set_={
                "reserved_posts": table.c.reserved_posts + max_posts,
                "estimated_cost_usd": proposed_cost,
                "updated_at": datetime.now(timezone.utc),
            },
            where=proposed_cost <= INTERNAL_LIMIT,
        )
        .returning(
            table.c.reserved_posts,
            table.c.estimated_cost_usd,
        )
    )

    result = session.execute(stmt).one_or_none()

    if result is None:
        raise XBudgetExceeded(
            "Monthly X read budget exhausted; reservation blocked"
        )

    return {
        "billing_month": billing_month,
        "reserved_posts": result.reserved_posts,
        "estimated_cost_usd": result.estimated_cost_usd,
        "remaining_usd": INTERNAL_LIMIT - result.estimated_cost_usd,
    }
