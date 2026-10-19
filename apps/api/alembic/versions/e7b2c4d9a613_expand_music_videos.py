"""Expand music_videos for unified YouTube catalog.

Revision ID: e7b2c4d9a613
Revises: d2a9f1c8b743
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "e7b2c4d9a613"
down_revision = "d2a9f1c8b743"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "music_videos",
        sa.Column("channel_title", sa.String(300), nullable=True),
    )
    op.add_column(
        "music_videos",
        sa.Column("categories", JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
    )
    op.add_column(
        "music_videos",
        sa.Column("playlist_ids", JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
    )
    op.add_column(
        "music_videos",
        sa.Column("aliases", JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
    )
    op.add_column(
        "music_videos",
        sa.Column("view_count", sa.BigInteger(), nullable=True),
    )
    op.add_column(
        "music_videos",
        sa.Column("like_count", sa.BigInteger(), nullable=True),
    )

    op.create_index(
        "ix_music_videos_published_at",
        "music_videos",
        ["published_at"],
    )
    op.create_index(
        "ix_music_videos_channel_id",
        "music_videos",
        ["channel_id"],
    )


def downgrade():
    op.drop_index(
        "ix_music_videos_channel_id",
        table_name="music_videos",
    )
    op.drop_index(
        "ix_music_videos_published_at",
        table_name="music_videos",
    )

    op.drop_column("music_videos", "like_count")
    op.drop_column("music_videos", "view_count")
    op.drop_column("music_videos", "aliases")
    op.drop_column("music_videos", "playlist_ids")
    op.drop_column("music_videos", "categories")
    op.drop_column("music_videos", "channel_title")
