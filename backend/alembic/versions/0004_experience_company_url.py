"""experience: the employer's website

Revision ID: 0004_experience_company_url
Revises: 0003_admin_totp
Create Date: 2026-09-26 10:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0004_experience_company_url"
down_revision: str | None = "0003_admin_totp"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("experience_entries", sa.Column("company_url", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("experience_entries", "company_url")
