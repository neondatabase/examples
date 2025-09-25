import os

import psycopg
from dotenv import load_dotenv

load_dotenv()

conn_string = os.getenv("DATABASE_URL")

try:
    with psycopg.connect(conn_string) as conn:
        print("Connection established")
        with conn.cursor() as cur:
            # Fetch all rows from the books table
            cur.execute("SELECT * FROM books ORDER BY publication_year;")
            rows = cur.fetchall()

            print("\n--- Book Library ---")
            for row in rows:
                print(
                    f"ID: {row[0]}, Title: {row[1]}, Author: {row[2]}, Year: {row[3]}, In Stock: {row[4]}"
                )
            print("--------------------\n")

except Exception as e:
    print("Connection failed.")
    print(e)