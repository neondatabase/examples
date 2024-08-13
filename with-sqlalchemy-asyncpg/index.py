import os
import asyncio
from sqlalchemy import text
from dotenv import load_dotenv
from urllib.parse import urlparse
from sqlalchemy.ext.asyncio import create_async_engine

load_dotenv()

tmpPostgres = urlparse(os.getenv("DATABASE_URL"))

async def async_main() -> None:
    engine = create_async_engine(f"postgresql+asyncpg://{tmpPostgres.username}:{tmpPostgres.password}@{tmpPostgres.hostname}{tmpPostgres.path}?ssl=require", echo=True)
    async with engine.connect() as conn:
        result = await conn.execute(text("select 'hello world'"))
        print(result.fetchall())
    await engine.dispose()

asyncio.run(async_main())
