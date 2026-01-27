from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import text

from app.db import SessionDep

from . import crud
from .schemas import RecordCreate, RecordResponse, RecordUpdate

router = APIRouter(tags=["records"])


@router.get("/health")
async def health_check(session: SessionDep) -> dict:
    """Check database connectivity."""
    try:
        await session.execute(text("SELECT 1"))
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Database unavailable: {e}")


@router.get("/records", response_model=list[RecordResponse])
async def list_records(
    session: SessionDep,
    skip: int = Query(default=0, ge=0, description="Number of records to skip"),
    limit: int = Query(
        default=100, ge=1, le=1000, description="Maximum number of records to return"
    ),
) -> list[RecordResponse]:
    """Get all records with pagination."""
    return await crud.get_records(session, skip=skip, limit=limit)


@router.get("/records/{record_id}", response_model=RecordResponse)
async def get_record(session: SessionDep, record_id: int) -> RecordResponse:
    """Get a single record by ID."""
    record = await crud.get_record(session, record_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Record not found")
    return record


@router.post("/records", response_model=RecordResponse, status_code=201)
async def create_record(
    session: SessionDep, record: RecordCreate
) -> RecordResponse:
    """Create a new record."""
    return await crud.create_record(session, record)


@router.patch("/records/{record_id}", response_model=RecordResponse)
async def update_record(
    session: SessionDep, record_id: int, record: RecordUpdate
) -> RecordResponse:
    """Update an existing record."""
    updated = await crud.update_record(session, record_id, record)
    if updated is None:
        raise HTTPException(status_code=404, detail="Record not found")
    return updated


@router.delete("/records/{record_id}", status_code=204)
async def delete_record(session: SessionDep, record_id: int) -> None:
    """Delete a record by ID."""
    deleted = await crud.delete_record(session, record_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Record not found")
