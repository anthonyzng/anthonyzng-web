from fastapi import APIRouter
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.api.deps import SessionDep
from app.core.errors import ApiError
from app.schemas.errors import ErrorResponse
from app.schemas.health import HealthStatus

router = APIRouter(tags=["health"])


@router.get(
    "/health",
    response_model=HealthStatus,
    responses={503: {"model": ErrorResponse, "description": "Database unreachable"}},
)
async def get_health(session: SessionDep) -> HealthStatus:
    try:
        await session.execute(text("SELECT 1"))
    except (SQLAlchemyError, OSError) as exc:
        raise ApiError(503, "service_unavailable", "Database unavailable.") from exc
    return HealthStatus()
