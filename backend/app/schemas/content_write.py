"""Write models for content rows: the seed file today, the Phase 5 admin API tomorrow.

Every model is camelCase, rejects unknown keys and carries a `Localized[...]` `translations`
object, so a row can only be saved with both locales present.
"""

from typing import Annotated, Self

from pydantic import Field, StringConstraints, model_validator

from app.schemas.common import Localized, Month, Slug, StrictCamelModel, Tag

Text200 = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Text100 = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
Text1000 = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)]
Text2000 = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]
OptionalTitle = Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)] | None
OptionalSummary = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)] | None
HttpUrl = Annotated[str, StringConstraints(max_length=2048, pattern=r"^https?://")]
LinkHref = Annotated[
    str, StringConstraints(min_length=1, max_length=2048, pattern=r"^(mailto:|https://|http://)")
]
Year = Annotated[str, StringConstraints(pattern=r"^\d{4}$")]
SortOrder = Annotated[int, Field(ge=0)]
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
    sort_order: SortOrder
    company: Text200
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
    sort_order: SortOrder
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
    sort_order: SortOrder
    items: Annotated[list[Tag], Field(min_length=1, max_length=50)]
    translations: Localized[SkillGroupText]


class EducationIn(StrictCamelModel):
    slug: Slug
    sort_order: SortOrder
    school: Text200
    year: Year
    translations: Localized[EducationText]


class CertificationIn(StrictCamelModel):
    slug: Slug
    sort_order: SortOrder
    name: Text200
    in_progress: bool


class SpokenLanguageIn(StrictCamelModel):
    slug: Slug
    sort_order: SortOrder
    translations: Localized[SpokenLanguageText]


class ContactLinkIn(StrictCamelModel):
    slug: Slug
    sort_order: SortOrder
    href: LinkHref
    display: Text200
    translations: Localized[ContactLinkText]


class SiteTextIn(StrictCamelModel):
    slug: Slug
    translations: Localized[SiteTextText]
