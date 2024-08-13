import asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

async def async_main() -> None:
    engine = create_async_engine("postgresql+asyncpg://neondb_owner:***@ep-***.us-east-2.aws.neon.tech/neondb", echo=True)
    async with engine.connect() as conn:
        result = await conn.execute(text("select 'hello world'"))
        print(result.fetchall())
    await engine.dispose()

asyncio.run(async_main())
