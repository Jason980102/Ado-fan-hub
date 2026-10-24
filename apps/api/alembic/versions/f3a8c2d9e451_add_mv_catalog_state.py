"""Add PostgreSQL MV catalog snapshot metadata.

Revision ID: f3a8c2d9e451
Revises: e7b2c4d9a613
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision = "f3a8c2d9e451"
down_revision = "e7b2c4d9a613"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "mv_catalog_state",
        sa.Column(
            "id", sa.Integer(), primary_key=True
        ),
        sa.Column(
            "source", sa.Text(), nullable=False
        ),
        sa.Column(
            "fetched_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column(
            "partial", sa.Boolean(), nullable=False
        ),
        sa.Column(
            "sources",
            JSONB(),
            nullable=False,
        ),
        sa.Column(
            "unavailable_video_ids",
            JSONB(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint(
            "id = 1",
            name="ck_mv_catalog_state_singleton",
        ),
    )


def downgrade():
    op.drop_table("mv_catalog_state")
