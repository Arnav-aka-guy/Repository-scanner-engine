"""Initial migration — create core tables.

Revision ID: 001_initial
Revises: None
Create Date: 2026-06-22
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create repositories, scan_records, chat_messages, generated_docs tables."""
    op.create_table(
        "repositories",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("path", sa.String(500), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("total_files", sa.Integer(), server_default="0"),
        sa.Column("total_lines", sa.Integer(), server_default="0"),
        sa.Column("languages_json", sa.Text(), server_default="{}"),
        sa.Column("last_scanned_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True)),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("path"),
    )
    op.create_index("ix_repositories_path", "repositories", ["path"])

    op.create_table(
        "scan_records",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("repository_id", sa.Integer(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("pending", "scanning", "indexing", "completed", "failed", name="scan_status"),
            server_default="pending",
        ),
        sa.Column("files_scanned", sa.Integer(), server_default="0"),
        sa.Column("files_indexed", sa.Integer(), server_default="0"),
        sa.Column("duration_ms", sa.Float(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["repository_id"], ["repositories.id"], ondelete="CASCADE"),
    )

    op.create_table(
        "chat_messages",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("repository_id", sa.Integer(), nullable=False),
        sa.Column(
            "role",
            sa.Enum("user", "assistant", name="message_role"),
            nullable=False,
        ),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True)),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["repository_id"], ["repositories.id"], ondelete="CASCADE"),
    )

    op.create_table(
        "generated_docs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("repository_id", sa.Integer(), nullable=False),
        sa.Column(
            "doc_type",
            sa.Enum("overview", "module", "architecture", "api_reference", "dependency_map", name="doc_type"),
            nullable=False,
        ),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True)),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["repository_id"], ["repositories.id"], ondelete="CASCADE"),
    )


def downgrade() -> None:
    """Drop all tables."""
    op.drop_table("generated_docs")
    op.drop_table("chat_messages")
    op.drop_table("scan_records")
    op.drop_table("repositories")

    # Drop enums
    sa.Enum(name="scan_status").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="message_role").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="doc_type").drop(op.get_bind(), checkfirst=True)
