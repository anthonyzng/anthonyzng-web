"""Building blocks shared by every schema: camelCase models, locales, `Localized[T]`, tags."""

from typing import Annotated, Any, Literal, get_args

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    PlainSerializer,
    PlainValidator,
    StringConstraints,
    TypeAdapter,
    ValidationError,
)
from pydantic.alias_generators import to_camel
from pydantic_core import PydanticCustomError

Locale = Literal["en", "zh-Hant"]
LOCALES: tuple[Locale, ...] = get_args(Locale)
DEFAULT_LOCALE: Locale = "en"

MONTH_PATTERN = r"^\d{4}-(0[1-9]|1[0-2])$"
"""The database CHECK on month columns (PostgreSQL's `\\d` is ASCII under the default collation)."""
MONTH_INPUT_PATTERN = r"^[0-9]{4}-(0[1-9]|1[0-2])$"
"""Input validation spells ASCII out: Pydantic's regex engine is Unicode-aware, so its `\\d` also
accepts full-width or Arabic-Indic digits, which the database CHECK and the frontend refuse."""
SLUG_PATTERN = r"^[a-z][a-zA-Z0-9_-]{0,63}$"

Month = Annotated[str, StringConstraints(pattern=MONTH_INPUT_PATTERN)]
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


TAG_TEXT_MAX_LENGTH = 100
_TAG_TEXT = TypeAdapter(NonEmptyStr)
_TAG_TERM = TypeAdapter(Localized[NonEmptyStr])


def _validate_tag(value: Any) -> str | Localized[str]:
    """One tag, one error: a failure is reported on the tag itself (`tech.2`), never on the
    internal branches of the union, so the admin form can put it next to the right chip."""
    if isinstance(value, Localized):
        return value
    try:
        if isinstance(value, str):
            return _TAG_TEXT.validate_python(value)
        if isinstance(value, dict):
            return _TAG_TERM.validate_python(value)
    except ValidationError as exc:
        kind = "name" if isinstance(value, str) else "term"
        raise PydanticCustomError(
            "tag_invalid",
            "A tag {kind} needs 1 to {limit} characters"
            + (" in both en and zh-Hant." if kind == "term" else "."),
            {"kind": kind, "limit": TAG_TEXT_MAX_LENGTH},
        ) from exc
    raise PydanticCustomError("tag_type", "A tag is a name (text) or a term ({en, zh-Hant}).")


def _serialize_tag(tag: str | Localized[str]) -> str | dict[str, str]:
    if isinstance(tag, str):
        return tag
    dumped: dict[str, str] = tag.model_dump(by_alias=True)
    return dumped


Tag = Annotated[
    NonEmptyStr | Localized[NonEmptyStr],
    PlainValidator(_validate_tag, json_schema_input_type=str | dict[str, str]),
    PlainSerializer(_serialize_tag, return_type=str | dict[str, str]),
]
"""A chip is a proper noun (`"React"`, never translated) or a translated term."""

TAG_LIST = TypeAdapter(list[Tag])


def resolve_tag(tag: Tag, locale: Locale) -> str:
    return tag if isinstance(tag, str) else tag.get(locale)


def resolve_tags(tags: list[Tag], locale: Locale) -> list[str]:
    return [resolve_tag(tag, locale) for tag in tags]
