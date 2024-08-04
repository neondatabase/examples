from ..db import database, playing_with_neon

async def get_all_records():
    query = playing_with_neon.select()
    return await database.fetch_all(query=query)
