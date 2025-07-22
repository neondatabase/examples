import asyncio
import os

import asyncpg
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()


async def run():
    # Get the connection string from the environment variable
    conn_string = os.getenv("DATABASE_URL")
    conn = None

    try:
        conn = await asyncpg.connect(conn_string)
        print("Connection established")

        # Drop the table if it already exists
        await conn.execute("DROP TABLE IF EXISTS books;")
        print("Finished dropping table (if it existed).")

        # Create a new table
        await conn.execute("""
            CREATE TABLE books (
                id SERIAL PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                author VARCHAR(255),
                publication_year INT,
                in_stock BOOLEAN DEFAULT TRUE
            );
        """)
        print("Finished creating table.")

        # Insert a single book record (using $1, $2 for placeholders)
        await conn.execute(
            "INSERT INTO books (title, author, publication_year, in_stock) VALUES ($1, $2, $3, $4);",
            "The Catcher in the Rye",
            "J.D. Salinger",
            1951,
            True,
        )
        print("Inserted a single book.")

        # Data to be inserted
        books_to_insert = [
            ("The Hobbit", "J.R.R. Tolkien", 1937, True),
            ("1984", "George Orwell", 1949, True),
            ("Dune", "Frank Herbert", 1965, False),
        ]

        # Insert multiple books at once
        await conn.executemany(
            "INSERT INTO books (title, author, publication_year, in_stock) VALUES ($1, $2, $3, $4);",
            books_to_insert,
        )
        print("Inserted 3 rows of data.")

    except Exception as e:
        print("Connection failed.")
        print(e)
    finally:
        if conn:
            await conn.close()


# Run the asynchronous function
asyncio.run(run())
