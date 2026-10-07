"""Migration 002: Add users table and repository ownership fields.

Revision ID: 002_user_repository_ownership
Revises: 001_initial
Create Date: 2026-10-07
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "002_user_repository_ownership"
down_revision: Union[str, None] = "001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create users table and add ownership columns to repositories."""
    # 1. Create users table
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("1"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
    )
    op.create_index("ix_users_email", "users", ["email"])

    # 2. Add columns to repositories table using batch_alter_table for SQLite compatibility
    with op.batch_alter_table("repositories", schema=None) as batch_op:
        batch_op.add_column(sa.Column("user_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("description", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("source_type", sa.String(50), server_default="local", nullable=False))
        batch_op.add_column(sa.Column("source_path", sa.String(500), nullable=True))
        batch_op.add_column(sa.Column("status", sa.String(50), server_default="CREATED", nullable=False))
        batch_op.add_column(sa.Column("language", sa.String(50), nullable=True))
        batch_op.add_column(sa.Column("file_count", sa.Integer(), server_default="0", nullable=False))
        batch_op.add_column(sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.create_foreign_key(
            "fk_repositories_user_id_users",
            "users",
            ["user_id"],
            ["id"],
            ondelete="CASCADE",
        )
        batch_op.create_index("ix_repositories_user_id", ["user_id"])


def downgrade() -> None:
    """Revert users table and ownership columns from repositories."""
    with op.batch_alter_table("repositories", schema=None) as batch_op:
        batch_op.drop_index("ix_repositories_user_id")
        batch_op.drop_constraint("fk_repositories_user_id_users", type_="foreignkey")
        batch_op.drop_column("updated_at")
        batch_op.drop_column("file_count")
        batch_op.drop_column("language")
        batch_op.drop_column("status")
        batch_op.drop_column("source_path")
        batch_op.drop_column("source_type")
        batch_op.drop_column("description")
        batch_op.drop_column("user_id")

    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
