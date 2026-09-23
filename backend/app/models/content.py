"""Content tables. `slug` is the natural primary key (the frontend's ids and the upsert target).

`translations` is `{"en": {...}, "zh-Hant": {...}}` and `tech` / `items` are arrays whose items
are a plain string (proper noun) or a `{"en", "zh-Hant"}` term object. Shapes are validated by
the Pydantic write models; the CHECK constraints only guard the JSON types and the two locales.
"""

from typing import Any

from sqlalchemy import Boolean, CheckConstraint, Index, Integer, Text, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import (
    Base,
    TimestampMixin,
    json_array_check,
    month_check,
    slug_check,
    sort_order_check,
    translations_check,
)
from app.schemas.common import MONTH_PATTERN

EMPTY_JSON_ARRAY = text("'[]'::jsonb")


class ExperienceEntry(TimestampMixin, Base):
    __tablename__ = "experience_entries"
    __table_args__ = (
        slug_check(),
        sort_order_check(),
        month_check("start_month"),
        CheckConstraint(
            f"end_month IS NULL OR (end_month ~ '{MONTH_PATTERN}' AND end_month >= start_month)",
            name="end_month_format",
        ),
        json_array_check("tech"),
        translations_check(),
        Index("experience_entries_sort_idx", "sort_order", "slug"),
    )

    slug: Mapped[str] = mapped_column(Text, primary_key=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False)
    company: Mapped[str] = mapped_column(Text, nullable=False)
    start_month: Mapped[str] = mapped_column(Text, nullable=False)
    end_month: Mapped[str | None] = mapped_column(Text, nullable=True)
    tech: Mapped[list[Any]] = mapped_column(JSONB, nullable=False, server_default=EMPTY_JSON_ARRAY)
    translations: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)


class Project(TimestampMixin, Base):
    __tablename__ = "projects"
    __table_args__ = (
        slug_check(),
        sort_order_check(),
        json_array_check("tech"),
        translations_check(),
        CheckConstraint(
            "NOT placeholder OR (url IS NULL AND tech = '[]'::jsonb)", name="placeholder_empty"
        ),
        Index("projects_sort_idx", "sort_order", "slug"),
    )

    slug: Mapped[str] = mapped_column(Text, primary_key=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False)
    placeholder: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    url: Mapped[str | None] = mapped_column(Text, nullable=True)
    tech: Mapped[list[Any]] = mapped_column(JSONB, nullable=False, server_default=EMPTY_JSON_ARRAY)
    translations: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)


class SkillGroup(TimestampMixin, Base):
    __tablename__ = "skill_groups"
    __table_args__ = (
        slug_check(),
        sort_order_check(),
        json_array_check("items"),
        translations_check(),
        Index("skill_groups_sort_idx", "sort_order", "slug"),
    )

    slug: Mapped[str] = mapped_column(Text, primary_key=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False)
    items: Mapped[list[Any]] = mapped_column(JSONB, nullable=False, server_default=EMPTY_JSON_ARRAY)
    translations: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)


class EducationEntry(TimestampMixin, Base):
    __tablename__ = "education_entries"
    __table_args__ = (
        slug_check(),
        sort_order_check(),
        CheckConstraint(r"year ~ '^\d{4}$'", name="year_format"),
        translations_check(),
    )

    slug: Mapped[str] = mapped_column(Text, primary_key=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False)
    school: Mapped[str] = mapped_column(Text, nullable=False)
    year: Mapped[str] = mapped_column(Text, nullable=False)
    translations: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)


class Certification(TimestampMixin, Base):
    __tablename__ = "certifications"
    __table_args__ = (slug_check(), sort_order_check())

    slug: Mapped[str] = mapped_column(Text, primary_key=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    in_progress: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))


class SpokenLanguage(TimestampMixin, Base):
    __tablename__ = "spoken_languages"
    __table_args__ = (slug_check(), sort_order_check(), translations_check())

    slug: Mapped[str] = mapped_column(Text, primary_key=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False)
    translations: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)


class ContactLink(TimestampMixin, Base):
    __tablename__ = "contact_links"
    __table_args__ = (slug_check(), sort_order_check(), translations_check())

    slug: Mapped[str] = mapped_column(Text, primary_key=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False)
    href: Mapped[str] = mapped_column(Text, nullable=False)
    display: Mapped[str] = mapped_column(Text, nullable=False)
    translations: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)


class SiteText(TimestampMixin, Base):
    __tablename__ = "site_texts"
    __table_args__ = (slug_check(), translations_check())

    slug: Mapped[str] = mapped_column(Text, primary_key=True)
    translations: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)


CONTACT_LOCATION_SLUG = "contact_location"
"""`site_texts` row holding the "Based in" value."""
