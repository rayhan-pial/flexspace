"""uploaded gallery images stored in the database

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-25
"""
import sqlalchemy as sa
from alembic import op

from app.db.models import UtcDateTime

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "images",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("owner_id", sa.String(36), nullable=False),
        sa.Column("content_type", sa.String(32), nullable=False),
        sa.Column("size", sa.Integer(), nullable=False),
        sa.Column("data", sa.LargeBinary(), nullable=False),
        sa.Column("created_at", UtcDateTime(), nullable=False),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], name=op.f("fk_images_owner_id_users"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_images")),
    )
    op.create_index("ix_images_owner_id", "images", ["owner_id"])


def downgrade() -> None:
    op.drop_index("ix_images_owner_id", table_name="images")
    op.drop_table("images")
