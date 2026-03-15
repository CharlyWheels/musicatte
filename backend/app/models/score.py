from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.sql import func

from ..database import Base


class Score(Base):
    __tablename__ = "scores"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    composer = Column(String(255), nullable=True)
    instrument = Column(String(100), nullable=False, default="piano")
    genre = Column(String(100), nullable=False, default="general")
    musicxml = Column(Text, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    version = Column(Integer, nullable=False, default=1)
    status = Column(String(20), nullable=False, default="draft")
    parent_score_id = Column(Integer, ForeignKey("scores.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
