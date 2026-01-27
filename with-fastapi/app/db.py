import ssl
from collections.abc import AsyncGenerator
from typing import Annotated
from urllib.parse import urlparse, urlunparse

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from .config import settings


def _prepare_database_url(url: str) -> str:
    """Convert database URL to asyncpg-compatible format.
    
    asyncpg doesn't support sslmode, channel_binding, or other libpq-style
    query parameters. We strip them from the URL and handle SSL via
    connect_args instead.
    """
    parsed = urlparse(url)
    
    # Build clean URL with asyncpg driver, no query params
    # SSL is handled via connect_args, not URL params
    clean_parsed = parsed._replace(
        scheme="postgresql+asyncpg",
        query=""  # Remove all query params - SSL handled separately
    )
    return urlunparse(clean_parsed)


DATABASE_URL = _prepare_database_url(settings.database_url)

# Create SSL context for secure connection to Neon
# Neon uses Let's Encrypt certificates which are in the system trust store
ssl_context = ssl.create_default_context()

# Create async engine with SSL configuration
engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
    connect_args={"ssl": ssl_context},
)

# Session factory for creating async sessions
async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Base class for SQLAlchemy ORM models."""

    pass


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """Dependency that provides an async database session."""
    async with async_session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


# Type alias for dependency injection
SessionDep = Annotated[AsyncSession, Depends(get_session)]
