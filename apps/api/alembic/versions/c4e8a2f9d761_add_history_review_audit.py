"""Add transactional audit records for History publication reviews.

Revision ID: c4e8a2f9d761
Revises: b7d9a1c3e502
"""

from alembic import op
import sqlalchemy as sa

revision = "c4e8a2f9d761"
down_revision = "b7d9a1c3e502"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "history_review_audit",
        sa.Column(
            "id",
            sa.BigInteger(),
            sa.Identity(),
            primary_key=True,
        ),
        sa.Column(
            "event_id",
            sa.String(length=120),
            sa.ForeignKey(
                "history_events.id",
                ondelete="RESTRICT",
            ),
            nullable=False,
        ),
        sa.Column(
            "action",
            sa.String(length=30),
            nullable=False,
        ),
        sa.Column(
            "old_status",
            sa.String(length=20),
            nullable=False,
        ),
        sa.Column(
            "new_status",
            sa.String(length=20),
            nullable=False,
        ),
        sa.Column(
            "reviewer",
            sa.String(length=120),
            nullable=False,
        ),
        sa.Column(
            "reason",
            sa.Text(),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "action IN ('review', 'publish', 'unpublish', 'reject')",
            name="ck_history_audit_action",
        ),
        sa.CheckConstraint(
            "length(trim(reviewer)) > 0",
            name="ck_history_audit_reviewer",
        ),
        sa.CheckConstraint(
            "length(trim(reason)) > 0",
            name="ck_history_audit_reason",
        ),
    )

    op.create_index(
        "ix_history_review_audit_event",
        "history_review_audit",
        ["event_id", "created_at"],
    )


def downgrade():
    op.drop_index(
        "ix_history_review_audit_event",
        table_name="history_review_audit",
    )
    op.drop_table("history_review_audit")