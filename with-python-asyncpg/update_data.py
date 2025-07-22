import asyncio
import os

import asyncpg
from dotenv import load_dotenv

load_dotenv()


async def run():
    conn_string = os.getenv("DATABASE_URL")
    conn = None
    try:
        conn = await asyncpg.connect(conn_string)
        print("Connection established")

        # Update a data row in the table
        await conn.execute(
            "UPDATE books SET in_stock = $1 WHERE title = $2;", True, "Dune"
        )
        print("Updated stock status for 'Dune'.")

    except Exception as e:
        print("Connection failed.")
        print(e)
    finally:
        if conn:
            await conn.close()


asyncio.run(run())
