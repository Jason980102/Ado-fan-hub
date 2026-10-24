"""Create shared monthly X API budget ledger.

Revision ID: d2a9f1c8b743
Revises: c8d9e7a6f102
"""

from alembic import op
import sqlalchemy as sa

revision = "d2a9f1c8b743"
down_revision = "c8d9e7a6f102"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "x_api_budget",
        sa.Column("billing_month", sa.String(7), nullable=False),
        sa.Column(
            "reserved_posts", sa.Integer(),
            server_default="0", nullable=False,
        ),
        sa.Column(
            "estimated_cost_usd", sa.Numeric(10, 4),
            server_default="0", nullable=False,
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True),
            server_default=sa.text("now()"), nullable=False,
        ),
        sa.PrimaryKeyConstraint("billing_month"),
        sa.CheckConstraint(
            "reserved_posts >= 0",
            name="ck_x_budget_nonnegative_posts",
        ),
        sa.CheckConstraint(
            "estimated_cost_usd >= 0 AND estimated_cost_usd <= 2.25",
            name="ck_x_budget_internal_limit",
        ),
    )


def downgrade() -> None:
    op.drop_table("x_api_budget")
