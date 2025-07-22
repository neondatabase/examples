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
            # Delete a data row from the table
            cur.execute("DELETE FROM books WHERE title = %s;", ("1984",))
            print("Deleted the book '1984' from the table.")

            # Commit the changes
            conn.commit()

except Exception as e:
    print("Connection failed.")
    print(e)
