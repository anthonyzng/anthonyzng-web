from typing import Any

import pytest
from pydantic import TypeAdapter, ValidationError

from app.schemas.common import TAG_LIST, Localized, Month, Slug, resolve_tags
from app.schemas.contact import ContactRequest
from app.schemas.content_write import (
    ExperienceIn,
    ProjectIn,
    SkillGroupIn,
)


def experience(**overrides: Any) -> dict[str, Any]:
    data: dict[str, Any] = {
        "slug": "acme",
        "sortOrder": 0,
        "company": "ACME",
        "start": "2020-01",
        "end": "2021-06",
        "tech": ["React", {"en": "Data pipelines", "zh-Hant": "數據管道"}],
        "translations": {
            "en": {"role": "Dev", "location": "Here", "bullets": ["Did a thing."]},
            "zh-Hant": {"role": "開發", "location": "這裡", "bullets": ["做了一件事。"]},
        },
    }
    data.update(overrides)
    return data


def test_localized_requires_both_locales() -> None:
    adapter = TypeAdapter(Localized[str])
    value = adapter.validate_python({"en": "a", "zh-Hant": "b"})
    assert value.en == "a"
    assert value.zh_hant == "b"
    assert value.get("zh-Hant") == "b"
    assert adapter.dump_python(value, by_alias=True) == {"en": "a", "zh-Hant": "b"}
    with pytest.raises(ValidationError):
        adapter.validate_python({"en": "a"})
    with pytest.raises(ValidationError):
        adapter.validate_python({"en": "a", "zh-Hant": "b", "fr": "c"})


def test_tags_resolve_per_locale() -> None:
    tags = TAG_LIST.validate_python(["React", {"en": "Data pipelines", "zh-Hant": "數據管道"}])
    assert resolve_tags(tags, "en") == ["React", "Data pipelines"]
    assert resolve_tags(tags, "zh-Hant") == ["React", "數據管道"]
    assert TAG_LIST.dump_python(tags, mode="json", by_alias=True) == [
        "React",
        {"en": "Data pipelines", "zh-Hant": "數據管道"},
    ]
    with pytest.raises(ValidationError):
        TAG_LIST.validate_python([""])
    with pytest.raises(ValidationError):
        TAG_LIST.validate_python([{"en": "only"}])


@pytest.mark.parametrize("value", ["2024-01", "1999-12"])
def test_valid_months(value: str) -> None:
    assert TypeAdapter(Month).validate_python(value) == value


@pytest.mark.parametrize("value", ["2024-13", "2024-1", "2024", "24-01", "2024-00"])
def test_invalid_months(value: str) -> None:
    with pytest.raises(ValidationError):
        TypeAdapter(Month).validate_python(value)


@pytest.mark.parametrize("value", ["a", "slotOne", "contact_location", "a" * 64])
def test_valid_slugs(value: str) -> None:
    assert TypeAdapter(Slug).validate_python(value) == value


@pytest.mark.parametrize("value", ["", "Upper", "1abc", "has space", "a" * 65])
def test_invalid_slugs(value: str) -> None:
    with pytest.raises(ValidationError):
        TypeAdapter(Slug).validate_python(value)


def test_experience_in_valid() -> None:
    item = ExperienceIn.model_validate(experience())
    assert item.sort_order == 0
    assert item.end == "2021-06"
    assert len(item.tech) == 2


def test_experience_in_end_before_start() -> None:
    with pytest.raises(ValidationError, match="earlier than start"):
        ExperienceIn.model_validate(experience(end="2019-12"))


def test_experience_in_present_role() -> None:
    assert ExperienceIn.model_validate(experience(end=None)).end is None


def test_experience_in_bullet_count_mismatch() -> None:
    data = experience()
    data["translations"]["zh-Hant"]["bullets"].append("另一件事。")
    with pytest.raises(ValidationError, match="same number of bullets"):
        ExperienceIn.model_validate(data)


def test_experience_in_rejects_unknown_keys() -> None:
    with pytest.raises(ValidationError, match="Extra inputs"):
        ExperienceIn.model_validate(experience(bogus=1))


def project(**overrides: Any) -> dict[str, Any]:
    data: dict[str, Any] = {
        "slug": "slotOne",
        "sortOrder": 0,
        "placeholder": True,
        "url": None,
        "tech": [],
        "translations": {
            "en": {"title": None, "summary": None},
            "zh-Hant": {"title": None, "summary": None},
        },
    }
    data.update(overrides)
    return data


def test_project_placeholder_valid() -> None:
    assert ProjectIn.model_validate(project()).placeholder


def test_project_placeholder_must_be_empty() -> None:
    with pytest.raises(ValidationError, match="no tech tags"):
        ProjectIn.model_validate(project(tech=["React"]))
    with pytest.raises(ValidationError, match="no url"):
        ProjectIn.model_validate(project(url="https://example.com"))
    data = project()
    data["translations"]["en"]["title"] = "Real"
    with pytest.raises(ValidationError, match="no title or summary"):
        ProjectIn.model_validate(data)


def test_project_real_needs_texts_and_http_url() -> None:
    real = project(
        placeholder=False,
        url="https://example.com/p",
        tech=["React"],
        translations={
            "en": {"title": "Title", "summary": "Summary"},
            "zh-Hant": {"title": "標題", "summary": "摘要"},
        },
    )
    assert ProjectIn.model_validate(real).url == "https://example.com/p"
    real["translations"]["zh-Hant"]["summary"] = None
    with pytest.raises(ValidationError, match="both locales"):
        ProjectIn.model_validate(real)
    real["translations"]["zh-Hant"]["summary"] = "摘要"
    real["url"] = "ftp://example.com"
    with pytest.raises(ValidationError):
        ProjectIn.model_validate(real)


def test_skill_group_needs_items() -> None:
    with pytest.raises(ValidationError):
        SkillGroupIn.model_validate(
            {
                "slug": "x",
                "sortOrder": 0,
                "items": [],
                "translations": {"en": {"label": "A"}, "zh-Hant": {"label": "甲"}},
            }
        )


def test_contact_request_trims_and_defaults_honeypot() -> None:
    body = ContactRequest.model_validate(
        {
            "name": "  Jane  ",
            "email": " jane@example.com ",
            "message": "   Hello there, world.  ",
            "turnstileToken": " tok ",
        }
    )
    assert body.name == "Jane"
    assert body.email == "jane@example.com"
    assert body.message == "Hello there, world."
    assert body.turnstile_token == "tok"
    assert body.website == ""


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("name", ""),
        ("name", "x" * 101),
        ("email", "not-an-email"),
        ("email", "x" * 250 + "@example.com"),
        ("message", "too short"),
        ("message", "x" * 5001),
        ("turnstileToken", ""),
        ("turnstileToken", "x" * 2049),
    ],
)
def test_contact_request_limits(field: str, value: str) -> None:
    data = {
        "name": "Jane",
        "email": "jane@example.com",
        "message": "Hello there, world.",
        "turnstileToken": "tok",
        field: value,
    }
    with pytest.raises(ValidationError) as excinfo:
        ContactRequest.model_validate(data)
    assert excinfo.value.errors()[0]["loc"] == (field,)
