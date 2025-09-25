import os

import psycopg
from dotenv import load_dotenv

load_dotenv()
conn_string = os.getenv("DATABASE_URL")

try:
    with psycopg.connect(conn_string) as conn:
        print("Connection established")
        with conn.cursor() as cur:
            # Update a data row in the table
            cur.execute(
                "UPDATE books SET in_stock = %s WHERE title = %s;", (True, "Dune")
            )
            print("Updated stock status for 'Dune'.")

except Exception as e:
    print("Connection failed.")
    print(e)