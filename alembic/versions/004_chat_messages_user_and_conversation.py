"""Migration 004: Add user_id, conversation_id, sources_json to chat_messages.

Revision ID: 004_chat_messages_user_and_conversation
Revises: 003_refresh_tokens_and_token_version
Create Date: 2026-10-11
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "004_chat_messages_user_and_conversation"
down_revision: Union[str, None] = "003_refresh_tokens_and_token_version"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add user_id, conversation_id, sources_json to chat_messages table."""
    with op.batch_alter_table("chat_messages", schema=None) as batch_op:
        batch_op.add_column(sa.Column("user_id", sa.Integer(), nullable=True))
        batch_op.add_column(
            sa.Column("conversation_id", sa.String(length=64), server_default="default", nullable=False)
        )
        batch_op.add_column(sa.Column("sources_json", sa.Text(), nullable=True))
        batch_op.create_foreign_key(
            "fk_chat_messages_user_id_users",
            "users",
            ["user_id"],
            ["id"],
            ondelete="CASCADE",
        )
        batch_op.create_index("ix_chat_messages_user_id", ["user_id"])
        batch_op.create_index("ix_chat_messages_conversation_id", ["conversation_id"])


def downgrade() -> None:
    """Revert user_id, conversation_id, sources_json from chat_messages table."""
    with op.batch_alter_table("chat_messages", schema=None) as batch_op:
        batch_op.drop_index("ix_chat_messages_conversation_id")
        batch_op.drop_index("ix_chat_messages_user_id")
        batch_op.drop_constraint("fk_chat_messages_user_id_users", type_="foreignkey")
        batch_op.drop_column("sources_json")
        batch_op.drop_column("conversation_id")
        batch_op.drop_column("user_id")
