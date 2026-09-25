"""admin two-factor sign-in (TOTP): encrypted secret, pending secret, last accepted step

Revision ID: 0003_admin_totp
Revises: 0002_admin_panel
Create Date: 2026-09-25 08:10:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0003_admin_totp"
down_revision: str | None = "0002_admin_panel"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ENABLED_CONSISTENT = "ck_admin_users_totp_enabled_consistent"


def upgrade() -> None:
    op.add_column("admin_users", sa.Column("totp_secret", sa.LargeBinary(), nullable=True))
    op.add_column(
        "admin_users", sa.Column("totp_enabled_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column("admin_users", sa.Column("totp_last_counter", sa.BigInteger(), nullable=True))
    op.add_column("admin_users", sa.Column("totp_pending_secret", sa.LargeBinary(), nullable=True))
    op.create_check_constraint(
        op.f(ENABLED_CONSISTENT),
        "admin_users",
        "(totp_secret IS NULL) = (totp_enabled_at IS NULL)",
    )


def downgrade() -> None:
    op.drop_constraint(op.f(ENABLED_CONSISTENT), "admin_users", type_="check")
    op.drop_column("admin_users", "totp_pending_secret")
    op.drop_column("admin_users", "totp_last_counter")
    op.drop_column("admin_users", "totp_enabled_at")
    op.drop_column("admin_users", "totp_secret")
