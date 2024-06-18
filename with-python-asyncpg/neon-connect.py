import os
import asyncio
import asyncpg
from dotenv import load_dotenv

async def main():
    # Load .env file
    load_dotenv()

    # Get the connection string from the environment variable
    connection_string = os.getenv('DATABASE_URL')

    # Create a connection pool
    pool = await asyncpg.create_pool(connection_string)

    # Acquire a connection from the pool
    async with pool.acquire() as conn:
        # Execute SQL commands to retrieve the current time and version from PostgreSQL
        time = await conn.fetchval('SELECT NOW();')
        version = await conn.fetchval('SELECT version();')

    # Close the pool
    await pool.close()

    # Print the results
    print('Current time:', time)
    print('PostgreSQL version:', version)

# Run the asynchronous main function
asyncio.run(main())
