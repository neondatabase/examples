import os
from dotenv import load_dotenv
import reflex as rx

load_dotenv()

config = rx.Config(
    app_name="with_reflex",
    plugins=[
        rx.plugins.SitemapPlugin(),
        rx.plugins.TailwindV4Plugin(),
    ],
    db_url=os.environ.get("DATABASE_URL"),
)
