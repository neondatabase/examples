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

        # Delete a data row from the table
        await conn.execute("DELETE FROM books WHERE title = $1;", "1984")
        print("Deleted the book '1984' from the table.")

    except Exception as e:
        print("Connection failed.")
        print(e)
    finally:
        if conn:
            await conn.close()


asyncio.run(run())
