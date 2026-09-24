"""`/api/v1` router."""

from fastapi import APIRouter

from app.api.v1 import admin, auth, contact, content, files, health
from app.schemas.errors import ErrorResponse

API_V1_PREFIX = "/api/v1"

router = APIRouter(
    prefix=API_V1_PREFIX,
    responses={
        404: {"model": ErrorResponse, "description": "Unknown route"},
        405: {"model": ErrorResponse, "description": "Wrong method"},
        422: {"model": ErrorResponse, "description": "Validation error"},
        500: {"model": ErrorResponse, "description": "Unexpected error"},
    },
)
router.include_router(health.router)
router.include_router(content.router)
router.include_router(contact.router)
router.include_router(auth.router)
router.include_router(files.router)
router.include_router(admin.router)
