from pydantic import BaseModel


class SongSchema(BaseModel):
    id: int
    name: str
    value: float

class SongDB(SongSchema):
    id: int