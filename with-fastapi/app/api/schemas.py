from pydantic import BaseModel, ConfigDict


class RecordBase(BaseModel):
    """Base schema with common fields."""

    name: str
    value: float | None = None


class RecordCreate(RecordBase):
    """Schema for creating a new record."""

    pass


class RecordUpdate(BaseModel):
    """Schema for updating a record (all fields optional)."""

    name: str | None = None
    value: float | None = None


class RecordResponse(RecordBase):
    """Schema for record responses including the ID."""

    id: int

    model_config = ConfigDict(from_attributes=True)
