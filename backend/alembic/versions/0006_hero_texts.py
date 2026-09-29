"""hero roles and home texts

Revision ID: 0006_hero_texts
Revises: 0005_tools_archive
Create Date: 2026-09-28 22:50:00.000000

The texts at the top of the home page and in "In brief" move from the frontend's locale files into
the database: the roles as the table `hero_roles`, the rest as `site_texts` rows. A database that
already holds content (a running site) gets the texts the page showed until now; an empty one
(a new server, the tests) is left empty for `python -m app.seed`, which refuses a database with
content.
"""

import json
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0006_hero_texts"
down_revision: str | None = "0005_tools_archive"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

HERO_ROLES = (
    ("fullStack", "Full Stack Software Developer", "全端軟件開發者"),
    ("ai", "AI Developer", "AI 開發者"),
    ("manager", "Assistant Manager, Software Development", "軟件開發助理經理"),
)
SITE_TEXTS = (
    ("hero_eyebrow", "Portfolio", "作品集"),
    ("hero_name_first", "Anthony", "Anthony"),
    ("hero_name_last", "Ng", "Ng"),
    ("statement_label", "In brief", "簡介"),
    (
        "statement_intro",
        (
            "I design and build end-to-end software — from scalable backends and AI-powered"
            " features to polished interfaces — and lead teams that ship them."
        ),
        (
            "我設計並開發端到端的軟件——由可擴展的後端、AI 驅動的功能，到精緻的使用者介面——"  # noqa: RUF001
            "並帶領團隊將產品推出。"
        ),
    ),
)
HAS_CONTENT = " OR ".join(
    f"EXISTS (SELECT 1 FROM {table})"
    for table in ("site_texts", "experience_entries", "projects", "contact_links")
)


def _translations(en: str, zh: str) -> str:
    return json.dumps({"en": {"text": en}, "zh-Hant": {"text": zh}}, ensure_ascii=False)


def upgrade() -> None:
    op.create_table(
        "hero_roles",
        sa.Column("slug", sa.Text(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("translations", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "jsonb_typeof(translations) = 'object' AND translations ? 'en' AND translations ? 'zh-Hant'",
            name=op.f("ck_hero_roles_translations_locales"),
        ),
        sa.CheckConstraint(
            "slug ~ '^[a-z][a-zA-Z0-9_-]{0,63}$'", name=op.f("ck_hero_roles_slug_format")
        ),
        sa.CheckConstraint("sort_order >= 0", name=op.f("ck_hero_roles_sort_order_non_negative")),
        sa.PrimaryKeyConstraint("slug", name=op.f("pk_hero_roles")),
    )
    for position, (slug, en, zh) in enumerate(HERO_ROLES):
        op.execute(
            sa.text(
                "INSERT INTO hero_roles (slug, sort_order, translations)"
                f" SELECT :slug, :position, CAST(:translations AS jsonb) WHERE ({HAS_CONTENT})"
                " ON CONFLICT (slug) DO NOTHING"
            ).bindparams(slug=slug, position=position, translations=_translations(en, zh))
        )
    for slug, en, zh in SITE_TEXTS:
        op.execute(
            sa.text(
                "INSERT INTO site_texts (slug, translations)"
                f" SELECT :slug, CAST(:translations AS jsonb) WHERE ({HAS_CONTENT})"
                " ON CONFLICT (slug) DO NOTHING"
            ).bindparams(slug=slug, translations=_translations(en, zh))
        )


def downgrade() -> None:
    op.execute(
        sa.text("DELETE FROM site_texts WHERE slug = ANY(:slugs)").bindparams(
            slugs=[slug for slug, _en, _zh in SITE_TEXTS]
        )
    )
    op.drop_table("hero_roles")
