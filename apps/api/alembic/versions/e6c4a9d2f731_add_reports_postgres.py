"""Add isolated PostgreSQL storage for Reports.

Revision ID: e6c4a9d2f731
Revises: b7d2e6a91c43
"""

from alembic import op
import sqlalchemy as sa

revision = "e6c4a9d2f731"
down_revision = "b7d2e6a91c43"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "reports_cases",
        sa.Column("id", sa.String(20), primary_key=True),
        sa.Column("owner", sa.String(64), nullable=False),
        sa.Column("request_id", sa.String(36), nullable=False),
        sa.Column("fingerprint", sa.String(64), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column(
            "status", sa.String(16), nullable=False,
            server_default="received"
        ),
        sa.Column("created_at", sa.BigInteger(), nullable=False),
        sa.Column("updated_at", sa.BigInteger(), nullable=False),
        sa.UniqueConstraint(
            "owner", "request_id",
            name="uq_reports_owner_request"
        ),
        sa.CheckConstraint(
            "status IN ('received', 'reviewing', 'resolved', 'closed')",
            name="ck_reports_status"
        ),
    )

    op.create_index(
        "ix_reports_cases_owner_created",
        "reports_cases",
        ["owner", "created_at"],
    )

    op.create_table(
        "reports_rate_limits",
        sa.Column("key", sa.String(128), primary_key=True),
        sa.Column("window", sa.BigInteger(), nullable=False),
        sa.Column("count", sa.Integer(), nullable=False),
        sa.CheckConstraint(
            "count >= 0",
            name="ck_reports_rate_limit_count"
        ),
    )

    op.create_table(
        "reports_case_audit",
        sa.Column(
            "id", sa.BigInteger(),
            sa.Identity(), primary_key=True
        ),
        sa.Column(
            "case_id", sa.String(20),
            sa.ForeignKey("reports_cases.id", ondelete="CASCADE"),
            nullable=False
        ),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("at", sa.BigInteger(), nullable=False),
        sa.CheckConstraint(
            "status IN ('received', 'reviewing', 'resolved', 'closed')",
            name="ck_reports_audit_status"
        ),
    )

    op.create_index(
        "ix_reports_case_audit_case",
        "reports_case_audit",
        ["case_id", "at"],
    )


def downgrade():
    op.drop_index(
        "ix_reports_case_audit_case",
        table_name="reports_case_audit"
    )
    op.drop_table("reports_case_audit")

    op.drop_table("reports_rate_limits")

    op.drop_index(
        "ix_reports_cases_owner_created",
        table_name="reports_cases"
    )
    op.drop_table("reports_cases")