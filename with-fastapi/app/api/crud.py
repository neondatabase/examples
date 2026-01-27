from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Record

from .schemas import RecordCreate, RecordUpdate


async def get_record(session: AsyncSession, record_id: int) -> Record | None:
    """Get a single record by ID."""
    return await session.get(Record, record_id)


async def get_records(
    session: AsyncSession, skip: int = 0, limit: int = 100
) -> list[Record]:
    """Get a list of records with pagination."""
    result = await session.execute(select(Record).offset(skip).limit(limit))
    return list(result.scalars().all())


async def create_record(session: AsyncSession, record: RecordCreate) -> Record:
    """Create a new record."""
    db_record = Record(**record.model_dump())
    session.add(db_record)
    await session.flush()
    await session.refresh(db_record)
    return db_record


async def update_record(
    session: AsyncSession, record_id: int, record: RecordUpdate
) -> Record | None:
    """Update an existing record."""
    db_record = await session.get(Record, record_id)
    if db_record is None:
        return None

    update_data = record.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_record, field, value)

    await session.flush()
    await session.refresh(db_record)
    return db_record


async def delete_record(session: AsyncSession, record_id: int) -> bool:
    """Delete a record by ID. Returns True if deleted, False if not found."""
    db_record = await session.get(Record, record_id)
    if db_record is None:
        return False

    await session.delete(db_record)
    return True
