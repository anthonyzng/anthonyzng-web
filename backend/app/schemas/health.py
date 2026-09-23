"""`GET /health` body."""

from typing import Literal

from app.schemas.common import CamelModel


class HealthStatus(CamelModel):
    status: Literal["ok"] = "ok"
    database: Literal["ok"] = "ok"
