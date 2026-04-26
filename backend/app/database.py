"""
数智安行 – Async SQLAlchemy database setup (SQLite + aiosqlite).
"""

from __future__ import annotations

from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

# ---------------------------------------------------------------------------
# Engine & session factory
# ---------------------------------------------------------------------------

DATABASE_URL = "sqlite+aiosqlite:///./digital_security.db"

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    connect_args={"check_same_thread": False},
)

async_session_maker = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


# ---------------------------------------------------------------------------
# Declarative base
# ---------------------------------------------------------------------------


class Base(DeclarativeBase):
    """Shared declarative base for all ORM models."""


# ---------------------------------------------------------------------------
# FastAPI dependency
# ---------------------------------------------------------------------------


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Yield an :class:`AsyncSession` and ensure it is closed afterwards."""
    async with async_session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


# ---------------------------------------------------------------------------
# Database initialisation
# ---------------------------------------------------------------------------


async def init_db() -> None:
    """Create all tables that are not yet present in the database."""
    # Import models so that their metadata is registered on Base before
    # create_all is called.  The import is intentionally placed here to
    # avoid circular-import issues at module level.
    from app import models  # noqa: F401 – side-effect import

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
