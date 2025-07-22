import os

import psycopg2
from dotenv import load_dotenv

load_dotenv()
conn_string = os.getenv("DATABASE_URL")
conn = None

try:
    with psycopg2.connect(conn_string) as conn:
        print("Connection established")
        with conn.cursor() as cur:
            # Update a data row in the table
            cur.execute(
                "UPDATE books SET in_stock = %s WHERE title = %s;", (True, "Dune")
            )
            print("Updated stock status for 'Dune'.")

            # Commit the changes
            conn.commit()

except Exception as e:
    print("Connection failed.")
    print(e)
