"""Migration 003: Add token_version to users and create refresh_tokens table.

Revision ID: 003_refresh_tokens_and_token_version
Revises: 002_user_repository_ownership
Create Date: 2026-10-10
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "003_refresh_tokens_and_token_version"
down_revision: Union[str, None] = "002_user_repository_ownership"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add token_version to users and create refresh_tokens table."""
    # 1. Add token_version column to users table
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.add_column(sa.Column("token_version", sa.Integer(), server_default="1", nullable=False))

    # 2. Create refresh_tokens table
    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("jti", sa.String(64), nullable=False),
        sa.Column("revoked", sa.Boolean(), server_default=sa.text("0"), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
        sa.UniqueConstraint("jti"),
    )
    op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"])
    op.create_index("ix_refresh_tokens_token_hash", "refresh_tokens", ["token_hash"])
    op.create_index("ix_refresh_tokens_jti", "refresh_tokens", ["jti"])


def downgrade() -> None:
    """Revert refresh_tokens table and token_version column."""
    op.drop_index("ix_refresh_tokens_jti", table_name="refresh_tokens")
    op.drop_index("ix_refresh_tokens_token_hash", table_name="refresh_tokens")
    op.drop_index("ix_refresh_tokens_user_id", table_name="refresh_tokens")
    op.drop_table("refresh_tokens")

    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_column("token_version")
