"""Admin authentication bodies, and the admin's two-factor settings."""

from datetime import datetime
from typing import Annotated

from pydantic import StringConstraints

from app.core.totp import CODE_PATTERN
from app.schemas.common import CamelModel, StrictCamelModel

Password = Annotated[str, StringConstraints(min_length=1, max_length=1024)]
TotpCode = Annotated[str, StringConstraints(pattern=CODE_PATTERN)]
"""Six ASCII digits (the admin panel removes spaces before sending)."""


class LoginRequest(CamelModel):
    email: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=254)]
    password: Password
    turnstile_token: Annotated[str, StringConstraints(min_length=1, max_length=2048)]


class LoginTotpRequest(StrictCamelModel):
    code: TotpCode


class LoginResult(CamelModel):
    email: str
    totp_required: bool
    """True: the password was right and an authenticator code is due (`POST /auth/login/totp`);
    no session exists yet."""


class AdminInfo(CamelModel):
    email: str


class TotpStatus(CamelModel):
    enabled: bool
    enabled_at: datetime | None


class TotpSetup(CamelModel):
    secret: str
    """Base32, for typing into an authenticator app by hand."""
    uri: str
    """The `otpauth://` URI the QR code carries."""


class TotpConfirmRequest(StrictCamelModel):
    """Turning two-factor sign-in on or off: the password again, and a current code."""

    password: Password
    code: TotpCode
