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

        # Fetch all rows from the books table
        rows = await conn.fetch("SELECT * FROM books ORDER BY publication_year;")

        print("\n--- Book Library ---")
        for row in rows:
            # asyncpg rows can be accessed by index or column name
            print(
                f"ID: {row['id']}, Title: {row['title']}, Author: {row['author']}, Year: {row['publication_year']}, In Stock: {row['in_stock']}"
            )
        print("--------------------\n")

    except Exception as e:
        print("Connection failed.")
        print(e)
    finally:
        if conn:
            await conn.close()


asyncio.run(run())
