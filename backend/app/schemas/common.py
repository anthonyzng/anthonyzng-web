"""Building blocks shared by every schema: camelCase models, locales, `Localized[T]`, tags."""

from typing import Annotated, Literal, get_args

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, TypeAdapter
from pydantic.alias_generators import to_camel

Locale = Literal["en", "zh-Hant"]
LOCALES: tuple[Locale, ...] = get_args(Locale)
DEFAULT_LOCALE: Locale = "en"

MONTH_PATTERN = r"^\d{4}-(0[1-9]|1[0-2])$"
SLUG_PATTERN = r"^[a-z][a-zA-Z0-9_-]{0,63}$"

Month = Annotated[str, StringConstraints(pattern=MONTH_PATTERN)]
"""`YYYY-MM`; string comparison orders months correctly."""

Slug = Annotated[str, StringConstraints(pattern=SLUG_PATTERN)]
"""Natural key of a content row; the frontend's existing ids."""

NonEmptyStr = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
"""A tag chip: proper noun or one translation of a term."""


class CamelModel(BaseModel):
    """Accepts and emits camelCase JSON keys; Python attribute names stay snake_case."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        validate_by_name=True,
        validate_by_alias=True,
        serialize_by_alias=True,
    )


class StrictCamelModel(CamelModel):
    """`CamelModel` that rejects unknown keys (request bodies and admin write models)."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        validate_by_name=True,
        validate_by_alias=True,
        serialize_by_alias=True,
        extra="forbid",
    )


class Localized[T](BaseModel):
    """`{"en": T, "zh-Hant": T}`; both locales are required."""

    model_config = ConfigDict(
        extra="forbid",
        validate_by_name=True,
        validate_by_alias=True,
        serialize_by_alias=True,
    )

    en: T
    zh_hant: T = Field(alias="zh-Hant")

    def get(self, locale: Locale) -> T:
        return self.en if locale == "en" else self.zh_hant


Tag = NonEmptyStr | Localized[NonEmptyStr]
"""A chip is a proper noun (`"React"`, never translated) or a translated term."""

TAG_LIST = TypeAdapter(list[Tag])


def resolve_tag(tag: Tag, locale: Locale) -> str:
    return tag if isinstance(tag, str) else tag.get(locale)


def resolve_tags(tags: list[Tag], locale: Locale) -> list[str]:
    return [resolve_tag(tag, locale) for tag in tags]
