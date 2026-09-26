"""Write models for content rows: the seed file and the admin API.

Every model is camelCase, rejects unknown keys and carries a `Localized[...]` `translations`
object, so a row can only be saved with both locales present. `sortOrder` may be left out: the
admin API then places a new row itself and keeps an existing row's order (the seed always sends it).
"""

import re
from typing import Annotated, Self
from urllib.parse import urlsplit

from pydantic import AfterValidator, Field, StringConstraints, model_validator

from app.schemas.common import Localized, Month, Slug, StrictCamelModel, Tag

Text200 = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Text100 = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
Text1000 = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)]
Text2000 = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]
OptionalTitle = Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)] | None
OptionalSummary = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)] | None

_HOST = re.compile(r"[^\x00-\x20\x7f/\\?#@%:\[\]<>^|]+")
"""A host name as a browser's URL parser takes it (letters in any script, digits, dots, hyphens)."""


def _check_web_url(value: str) -> str:
    """A full http(s) URL a browser can parse: the public site checks every link with the WHATWG
    parser and would reject the whole payload, so the API must not store one it would refuse."""
    if any(character.isspace() for character in value):
        raise ValueError("A URL cannot contain spaces.")
    try:
        parts = urlsplit(value)
        port_ok = parts.port is None or parts.port > 0
    except ValueError as exc:  # a malformed [IPv6] host or a port that is not 0-65535
        raise ValueError("The URL's host or port is not valid.") from exc
    host = parts.hostname or ""
    ipv6 = parts.netloc.rsplit("@", 1)[-1].startswith("[")
    if parts.scheme not in ("http", "https") or not host or not port_ok:
        raise ValueError("Enter a full http:// or https:// URL.")
    if not ipv6 and not _HOST.fullmatch(host):
        raise ValueError("The URL's host is not valid.")
    return value


HttpUrl = Annotated[
    str,
    StringConstraints(max_length=2048, pattern=r"^https?://"),
    AfterValidator(_check_web_url),
]
LinkHref = Annotated[
    str, StringConstraints(min_length=1, max_length=2048, pattern=r"^(mailto:|https://|http://)")
]
Year = Annotated[str, StringConstraints(pattern=r"^[0-9]{4}$")]
SortOrder = Annotated[int, Field(ge=0, le=2**31 - 1)]
"""An int4 column; left out (None), the admin API decides."""
TagList = Annotated[list[Tag], Field(max_length=50)]


class ExperienceText(StrictCamelModel):
    role: Text200
    location: Text200
    bullets: Annotated[list[Text1000], Field(min_length=1, max_length=20)]


class ProjectText(StrictCamelModel):
    title: OptionalTitle
    summary: OptionalSummary


class SkillGroupText(StrictCamelModel):
    label: Text100


class EducationText(StrictCamelModel):
    degree: Text200


class SpokenLanguageText(StrictCamelModel):
    name: Text100


class ContactLinkText(StrictCamelModel):
    label: Text100


class SiteTextText(StrictCamelModel):
    text: Text2000


class ExperienceIn(StrictCamelModel):
    slug: Slug
    sort_order: SortOrder | None = None
    company: Text200
    company_url: HttpUrl | None = None
    """The employer's website, linked from the company name; optional."""
    start: Month
    end: Month | None
    tech: TagList
    translations: Localized[ExperienceText]

    @model_validator(mode="after")
    def _check_consistency(self) -> Self:
        if self.end is not None and self.end < self.start:
            raise ValueError("end must not be earlier than start")
        if len(self.translations.en.bullets) != len(self.translations.zh_hant.bullets):
            raise ValueError("both locales must have the same number of bullets")
        return self


class ProjectIn(StrictCamelModel):
    slug: Slug
    sort_order: SortOrder | None = None
    placeholder: bool
    url: HttpUrl | None
    tech: TagList
    translations: Localized[ProjectText]

    @model_validator(mode="after")
    def _check_placeholder(self) -> Self:
        texts = (self.translations.en, self.translations.zh_hant)
        if self.placeholder:
            if any(text.title is not None or text.summary is not None for text in texts):
                raise ValueError("a placeholder project has no title or summary")
            if self.tech:
                raise ValueError("a placeholder project has no tech tags")
            if self.url is not None:
                raise ValueError("a placeholder project has no url")
        elif any(not text.title or not text.summary for text in texts):
            raise ValueError("a project needs a title and a summary in both locales")
        return self


class SkillGroupIn(StrictCamelModel):
    slug: Slug
    sort_order: SortOrder | None = None
    items: Annotated[list[Tag], Field(min_length=1, max_length=50)]
    translations: Localized[SkillGroupText]


class EducationIn(StrictCamelModel):
    slug: Slug
    sort_order: SortOrder | None = None
    school: Text200
    year: Year
    translations: Localized[EducationText]


class CertificationIn(StrictCamelModel):
    slug: Slug
    sort_order: SortOrder | None = None
    name: Text200
    in_progress: bool


class SpokenLanguageIn(StrictCamelModel):
    slug: Slug
    sort_order: SortOrder | None = None
    translations: Localized[SpokenLanguageText]


class ContactLinkIn(StrictCamelModel):
    slug: Slug
    sort_order: SortOrder | None = None
    href: LinkHref
    display: Text200
    translations: Localized[ContactLinkText]


class SiteTextIn(StrictCamelModel):
    slug: Slug
    translations: Localized[SiteTextText]
