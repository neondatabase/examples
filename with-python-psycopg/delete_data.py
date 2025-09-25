import os

import psycopg
from dotenv import load_dotenv

load_dotenv()
conn_string = os.getenv("DATABASE_URL")

try:
    with psycopg.connect(conn_string) as conn:
        print("Connection established")
        with conn.cursor() as cur:
            # Delete a data row from the table
            cur.execute("DELETE FROM books WHERE title = %s;", ("1984",))
            print("Deleted the book '1984' from the table.")

except Exception as e:
    print("Connection failed.")
    print(e)