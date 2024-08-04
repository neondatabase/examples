from typing import List

from fastapi import APIRouter

from .crud import get_all_records
from .models import SongDB

router = APIRouter()

@router.get("/", response_model=List[SongDB])
async def read_all_records():
    return await get_all_records()
