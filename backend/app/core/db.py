"""Async SQLAlchemy engine and session factory."""

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

SessionFactory = async_sessionmaker[AsyncSession]


def create_engine(database_url: str) -> AsyncEngine:
    """Engine for the given `postgresql+asyncpg://` URL; `pool_pre_ping` survives DB restarts."""
    return create_async_engine(database_url, pool_pre_ping=True)


def create_session_factory(engine: AsyncEngine) -> SessionFactory:
    """`expire_on_commit=False` keeps loaded attributes usable after commit in async code."""
    return async_sessionmaker(engine, expire_on_commit=False)
