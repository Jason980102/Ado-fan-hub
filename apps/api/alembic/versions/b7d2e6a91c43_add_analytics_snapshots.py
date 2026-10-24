"""Add persistent YouTube analytics history tables.

Revision ID: b7d2e6a91c43
Revises: c4e8a2f9d761
"""

from alembic import op
import sqlalchemy as sa

revision = "b7d2e6a91c43"
down_revision = "c4e8a2f9d761"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "analytics_channel_snapshots",
        sa.Column("channel_id", sa.String(64), nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("subscriber_count", sa.BigInteger(), nullable=True),
        sa.Column(
            "subscriber_count_is_approximate",
            sa.Boolean(),
            nullable=False,
        ),
        sa.Column("view_count", sa.BigInteger(), nullable=True),
        sa.Column("video_count", sa.BigInteger(), nullable=True),
        sa.PrimaryKeyConstraint("channel_id", "fetched_at"),
    )

    op.create_table(
        "analytics_video_snapshots",
        sa.Column("channel_id", sa.String(64), nullable=False),
        sa.Column("video_id", sa.String(32), nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("thumbnail_url", sa.Text(), nullable=True),
        sa.Column("view_count", sa.BigInteger(), nullable=True),
        sa.PrimaryKeyConstraint(
            "channel_id", "fetched_at", "video_id"
        ),
    )

    op.create_index(
        "ix_analytics_video_history",
        "analytics_video_snapshots",
        ["channel_id", "video_id", "fetched_at"],
    )


def downgrade():
    op.drop_index(
        "ix_analytics_video_history",
        table_name="analytics_video_snapshots",
    )
    op.drop_table("analytics_video_snapshots")
    op.drop_table("analytics_channel_snapshots")
