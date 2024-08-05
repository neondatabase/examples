import os
import psycopg2
from flask import Flask
from dotenv import load_dotenv  
from urllib.parse import urlparse

load_dotenv()

app = Flask(__name__)

def get_db_connection():
    p = urlparse(os.getenv("DATABASE_URL"))
    return psycopg2.connect(
        host=p.hostname,
        database=p.path.replace("/", ""),
        user=p.username,
        password=p.password,
        port=5432,
    )

@app.route("/")
def index():
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM playing_with_neon")
    books = cur.fetchall()
    cur.close()
    conn.close()
    return books
