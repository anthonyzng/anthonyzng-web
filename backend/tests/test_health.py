import httpx
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from app.core.db import create_session_factory
from tests.conftest import services_of


async def test_health_ok(client: httpx.AsyncClient) -> None:
    response = await client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}
    assert "cache-control" not in response.headers


async def test_health_reports_database_outage(app: FastAPI, client: httpx.AsyncClient) -> None:
    services = services_of(app)
    healthy_factory = services.session_factory
    dead_engine = create_async_engine(
        "postgresql+asyncpg://nobody:nothing@127.0.0.1:1/nowhere", poolclass=NullPool
    )
    services.session_factory = create_session_factory(dead_engine)
    try:
        response = await client.get("/api/v1/health")
    finally:
        services.session_factory = healthy_factory
        await dead_engine.dispose()
    assert response.status_code == 503
    assert response.json() == {
        "error": {"code": "service_unavailable", "message": "Database unavailable."}
    }
