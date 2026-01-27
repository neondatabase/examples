from sqlalchemy import Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


class Record(Base):
    """SQLAlchemy ORM model for the playing_with_neon table."""

    __tablename__ = "playing_with_neon"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    value: Mapped[float] = mapped_column(Float, nullable=True)
