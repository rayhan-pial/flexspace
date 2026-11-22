"""initial schema: users, workspaces, templates, sessions

Revision ID: 0001
Revises:
Create Date: 2026-11-23
"""
import sqlalchemy as sa
from alembic import op

from app.db.models import UtcDateTime

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("email", sa.String(254), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("created_at", UtcDateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
        sa.UniqueConstraint("email", name=op.f("uq_users_email")),
    )
    op.create_table(
        "workspaces",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("user_id", sa.String(36), nullable=False),
        sa.Column("config", sa.JSON(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("created_at", UtcDateTime(), nullable=False),
        sa.Column("updated_at", UtcDateTime(), nullable=False),
        sa.CheckConstraint("revision >= 1", name=op.f("ck_workspaces_revision_positive")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_workspaces_user_id_users"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_workspaces")),
        sa.UniqueConstraint("user_id", name=op.f("uq_workspaces_user_id")),
    )
    op.create_table(
        "templates",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("owner_id", sa.String(36), nullable=True),
        sa.Column("system_key", sa.String(64), nullable=True),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("config", sa.JSON(), nullable=False),
        sa.Column("created_at", UtcDateTime(), nullable=False),
        sa.Column("updated_at", UtcDateTime(), nullable=False),
        sa.CheckConstraint(
            "(system_key IS NOT NULL AND owner_id IS NULL) OR "
            "(system_key IS NULL AND owner_id IS NOT NULL)",
            name=op.f("ck_templates_system_xor_custom"),
        ),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], name=op.f("fk_templates_owner_id_users"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_templates")),
        sa.UniqueConstraint("system_key", name=op.f("uq_templates_system_key")),
    )
    op.create_index("ix_templates_owner_id", "templates", ["owner_id"])
    op.create_table(
        "sessions",
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("user_id", sa.String(36), nullable=False),
        sa.Column("csrf_token", sa.String(64), nullable=False),
        sa.Column("created_at", UtcDateTime(), nullable=False),
        sa.Column("expires_at", UtcDateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_sessions_user_id_users"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("token_hash", name=op.f("pk_sessions")),
    )
    op.create_index("ix_sessions_expires_at", "sessions", ["expires_at"])


def downgrade() -> None:
    op.drop_index("ix_sessions_expires_at", table_name="sessions")
    op.drop_table("sessions")
    op.drop_index("ix_templates_owner_id", table_name="templates")
    op.drop_table("templates")
    op.drop_table("workspaces")
    op.drop_table("users")
