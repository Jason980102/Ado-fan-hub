"""Add independent incremental sync state for public X accounts."""

from alembic import op
import sqlalchemy as sa

revision = "c8d9e7a6f102"
down_revision = "38e2625e9425"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "x_sync_state",
        sa.Column("source_code", sa.String(40), nullable=False),
        sa.Column("x_user_id", sa.String(32), nullable=True),
        sa.Column("since_id", sa.String(32), nullable=True),
        sa.Column(
            "last_success_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["source_code"], ["news_sources.code"]
        ),
        sa.PrimaryKeyConstraint("source_code"),
    )


def downgrade() -> None:
    op.drop_table("x_sync_state")
