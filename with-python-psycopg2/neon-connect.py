import os
from psycopg2 import pool
from dotenv import load_dotenv

# Load .env file
load_dotenv()

# Get the connection string from the environment variable
connection_string = os.getenv('DATABASE_URL')

# Create a connection pool
connection_pool = pool.SimpleConnectionPool(
    1,  # Minimum number of connections in the pool
    10,  # Maximum number of connections in the pool
    connection_string
)

# Get a connection from the pool
conn = connection_pool.getconn()

# Create a cursor object
cur = conn.cursor()

# Execute SQL commands to retrieve the current time and version from PostgreSQL
cur.execute('SELECT NOW();')
time = cur.fetchone()[0]

cur.execute('SELECT version();')
version = cur.fetchone()[0]

# Close the cursor and return the connection to the pool
cur.close()
connection_pool.putconn(conn)

# Close all connections in the pool
connection_pool.closeall()

# Print the results
print('Current time:', time)
print('PostgreSQL version:', version)
