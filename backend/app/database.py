from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from urllib.parse import quote
from app.config import settings


def _safe_db_url(url: str) -> str:
    """
    Ensure the URL uses the asyncpg driver and re-encode the password
    so special characters don't break URL parsing.
    """
    if "://" not in url:
        return url
    scheme, rest = url.split("://", 1)

    # Normalise scheme to always use asyncpg
    if scheme in ("postgresql", "postgres"):
        scheme = "postgresql+asyncpg"
    elif scheme == "postgresql+psycopg2":
        scheme = "postgresql+asyncpg"

    # Re-encode password (split on last '@' so embedded '@' in password works)
    at = rest.rfind("@")
    if at == -1:
        return f"{scheme}://{rest}"
    credentials, host_part = rest[:at], rest[at + 1:]
    colon = credentials.find(":")
    if colon == -1:
        return f"{scheme}://{rest}"
    user, password = credentials[:colon], credentials[colon + 1:]
    return f"{scheme}://{user}:{quote(password, safe='')}@{host_part}"


_db_url = _safe_db_url(settings.database_url)
_is_postgres = _db_url.startswith("postgresql")
engine = create_async_engine(
    _db_url,
    echo=False,
    connect_args={"ssl": "require"} if _is_postgres else {},
)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

class Base(DeclarativeBase):
    pass

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session

async def init_db():
    async with engine.begin() as conn:
        from app.models import alert, lsr, corridor
        await conn.run_sync(Base.metadata.create_all)
