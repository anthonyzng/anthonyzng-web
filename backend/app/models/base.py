"""Declarative base, naming convention, timestamp mixin and the shared CHECK constraints."""

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, MetaData, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from app.schemas.common import MONTH_PATTERN, SLUG_PATTERN

NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


def slug_check() -> CheckConstraint:
    return CheckConstraint(f"slug ~ '{SLUG_PATTERN}'", name="slug_format")


def sort_order_check() -> CheckConstraint:
    return CheckConstraint("sort_order >= 0", name="sort_order_non_negative")


def month_check(column: str, *, nullable: bool = False) -> CheckConstraint:
    pattern = f"{column} ~ '{MONTH_PATTERN}'"
    if nullable:
        pattern = f"{column} IS NULL OR ({pattern})"
    return CheckConstraint(pattern, name=f"{column}_format")


def json_array_check(column: str) -> CheckConstraint:
    return CheckConstraint(f"jsonb_typeof({column}) = 'array'", name=f"{column}_is_array")


def translations_check() -> CheckConstraint:
    return CheckConstraint(
        "jsonb_typeof(translations) = 'object' "
        "AND translations ? 'en' AND translations ? 'zh-Hant'",
        name="translations_locales",
    )
