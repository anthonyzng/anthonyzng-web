"""Admin authentication bodies."""

from typing import Annotated

from pydantic import StringConstraints

from app.schemas.common import CamelModel


class LoginRequest(CamelModel):
    email: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=254)]
    password: Annotated[str, StringConstraints(min_length=1, max_length=1024)]


class AdminInfo(CamelModel):
    email: str
