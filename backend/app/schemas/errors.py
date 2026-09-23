"""The error envelope (see `app.core.errors`)."""

from pydantic import BaseModel, ConfigDict, Field


class ErrorBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str = Field(description="Stable snake_case identifier the client maps to its own copy.")
    message: str = Field(description="Developer-facing English text; never shown to visitors.")
    fields: dict[str, str] | None = Field(
        default=None, description="Present only for validation_error: field path -> message."
    )


class ErrorResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    error: ErrorBody
