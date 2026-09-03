from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.sql import func

from ..database import Base

# Notation formats a score can be stored in. MEI is the internal format: it is
# Verovio's native encoding and the only one its editing API understands.
# MusicXML exists only at the import/export boundary.
SCORE_FORMATS = ("mei", "musicxml")


class Score(Base):
    __tablename__ = "scores"
    __table_args__ = (
        Index("ix_scores_user_created", "user_id", "created_at"),
        Index("ix_scores_status_created", "status", "created_at"),
    )

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    composer = Column(String(255), nullable=True)
    instrument = Column(String(100), nullable=False, default="piano")
    genre = Column(String(100), nullable=False, default="general")

    # The notation itself, plus what it actually is. The previous column was
    # called "musicxml" and held MEI; naming the format explicitly is what
    # stops that from happening again.
    score_data = Column(Text, nullable=False)
    score_format = Column(String(20), nullable=False, default="mei")

    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    version = Column(Integer, nullable=False, default=1)
    status = Column(String(20), nullable=False, default="draft")
    parent_score_id = Column(Integer, ForeignKey("scores.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
