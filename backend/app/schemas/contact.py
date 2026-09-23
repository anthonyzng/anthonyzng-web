"""`POST /contact` request and response bodies."""

from typing import Annotated, Literal

from pydantic import EmailStr, StringConstraints

from app.schemas.common import CamelModel, StrictCamelModel


class ContactRequest(StrictCamelModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
    email: Annotated[EmailStr, StringConstraints(strip_whitespace=True, max_length=254)]
    message: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=10, max_length=5000)
    ]
    turnstile_token: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2048)
    ]
    website: str = ""
    """Honeypot: real visitors never see the field, so any value marks the submission as a bot."""


class ContactAccepted(CamelModel):
    status: Literal["accepted"] = "accepted"
