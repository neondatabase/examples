import os

from databases import Database
from sqlalchemy import (REAL, Column, Integer, MetaData, Table, Text,
                        create_engine)

DATABASE_URL = os.environ.get("DATABASE_URL")

engine = create_engine(DATABASE_URL)
metadata = MetaData()

playing_with_neon = Table(
    "playing_with_neon",
    metadata,
    Column("id",Integer,primary_key=True),
    Column("name",Text,nullable=False),
    Column("value",REAL),
)

database = Database(DATABASE_URL)
