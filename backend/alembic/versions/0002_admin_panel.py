"""admin panel: stored files, project cover images, message read state

Revision ID: 0002_admin_panel
Revises: 0001_initial_schema
Create Date: 2026-09-23 19:14:08.391825

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0002_admin_panel"
down_revision: str | None = "0001_initial_schema"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

PLACEHOLDER_EMPTY = "ck_projects_placeholder_empty"


def upgrade() -> None:
    op.create_table(
        "stored_files",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("content_type", sa.Text(), nullable=False),
        sa.Column("filename", sa.Text(), nullable=True),
        sa.Column("size", sa.Integer(), nullable=False),
        sa.Column("sha256", sa.Text(), nullable=False),
        sa.Column("width", sa.Integer(), nullable=True),
        sa.Column("height", sa.Integer(), nullable=True),
        sa.Column("data", sa.LargeBinary(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "kind IN ('cv', 'project_image')", name=op.f("ck_stored_files_kind_values")
        ),
        sa.CheckConstraint("sha256 ~ '^[0-9a-f]{64}$'", name=op.f("ck_stored_files_sha256_format")),
        sa.CheckConstraint(
            "(width IS NULL AND height IS NULL) OR (width > 0 AND height > 0)",
            name=op.f("ck_stored_files_dimensions"),
        ),
        sa.CheckConstraint(
            "size > 0 AND size = octet_length(data)",
            name=op.f("ck_stored_files_size_matches_data"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_stored_files")),
    )
    op.create_index(
        "stored_files_single_cv",
        "stored_files",
        ["kind"],
        unique=True,
        postgresql_where=sa.text("kind = 'cv'"),
    )
    op.add_column(
        "contact_messages", sa.Column("read_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column("projects", sa.Column("image_id", sa.UUID(), nullable=True))
    op.create_unique_constraint(op.f("uq_projects_image_id"), "projects", ["image_id"])
    op.create_foreign_key(
        op.f("fk_projects_image_id_stored_files"),
        "projects",
        "stored_files",
        ["image_id"],
        ["id"],
        ondelete="SET NULL",
    )
    # A placeholder project now also has no cover image.
    op.drop_constraint(op.f(PLACEHOLDER_EMPTY), "projects", type_="check")
    op.create_check_constraint(
        op.f(PLACEHOLDER_EMPTY),
        "projects",
        "NOT placeholder OR (url IS NULL AND tech = '[]'::jsonb AND image_id IS NULL)",
    )


def downgrade() -> None:
    op.drop_constraint(op.f(PLACEHOLDER_EMPTY), "projects", type_="check")
    op.drop_constraint(op.f("fk_projects_image_id_stored_files"), "projects", type_="foreignkey")
    op.drop_constraint(op.f("uq_projects_image_id"), "projects", type_="unique")
    op.drop_column("projects", "image_id")
    op.create_check_constraint(
        op.f(PLACEHOLDER_EMPTY),
        "projects",
        "NOT placeholder OR (url IS NULL AND tech = '[]'::jsonb)",
    )
    op.drop_column("contact_messages", "read_at")
    op.drop_index(
        "stored_files_single_cv",
        table_name="stored_files",
        postgresql_where=sa.text("kind = 'cv'"),
    )
    op.drop_table("stored_files")
