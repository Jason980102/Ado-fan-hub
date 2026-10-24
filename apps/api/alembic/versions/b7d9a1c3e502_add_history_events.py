"""Add curated Ado History events and official evidence sources.

Revision ID: b7d9a1c3e502
Revises: f3a8c2d9e451
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "b7d9a1c3e502"
down_revision = "f3a8c2d9e451"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "history_events",
        sa.Column("id", sa.String(120), primary_key=True),
        sa.Column("event_date", sa.Date(), nullable=False),
        sa.Column("category", sa.String(40), nullable=False),
        sa.Column("title", JSONB(), nullable=False),
        sa.Column("summary", JSONB(), nullable=False),
        sa.Column("details", JSONB(), nullable=False),
        sa.Column("significance", JSONB(), nullable=False),
        sa.Column("image_url", sa.Text(), nullable=True),
        sa.Column("image_source_url", sa.Text(), nullable=True),
        sa.Column("image_credit", sa.Text(), nullable=True),
        sa.Column(
            "image_usage_status",
            sa.String(30),
            nullable=False,
            server_default="pending",
        ),
        sa.Column(
            "image_alt",
            JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "status",
            sa.String(20),
            nullable=False,
            server_default="draft",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint(
            "status IN ('draft', 'review', 'published', 'rejected')",
            name="ck_history_events_status",
        ),
        sa.CheckConstraint(
            "image_usage_status IN ('pending', 'approved', 'restricted')",
            name="ck_history_events_image_usage",
        ),
    )

    op.create_index(
        "ix_history_events_date",
        "history_events",
        ["event_date"],
    )
    op.create_index(
        "ix_history_events_status_date",
        "history_events",
        ["status", "event_date"],
    )

    op.create_table(
        "history_event_sources",
        sa.Column(
            "id",
            sa.BigInteger(),
            sa.Identity(),
            primary_key=True,
        ),
        sa.Column(
            "event_id",
            sa.String(120),
            sa.ForeignKey("history_events.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("source_url", sa.Text(), nullable=False),
        sa.Column("source_name", sa.String(160), nullable=False),
        sa.Column(
            "source_type",
            sa.String(40),
            nullable=False,
            server_default="official",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint(
            "event_id",
            "source_url",
            name="uq_history_event_source",
        ),
    )

    op.create_index(
        "ix_history_sources_event_id",
        "history_event_sources",
        ["event_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_history_sources_event_id",
        table_name="history_event_sources",
    )
    op.drop_table("history_event_sources")
    op.drop_index(
        "ix_history_events_status_date",
        table_name="history_events",
    )
    op.drop_index(
        "ix_history_events_date",
        table_name="history_events",
    )
    op.drop_table("history_events")