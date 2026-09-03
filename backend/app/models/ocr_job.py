from sqlalchemy import JSON, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.sql import func

from ..database import Base


class OcrJob(Base):
    __tablename__ = "ocr_jobs"

    id = Column(Integer, primary_key=True, index=True)
    # Without an owner every authenticated caller could read every scan by
    # walking the ids.
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    status = Column(String(30), nullable=False, default="queued")
    image_path = Column(String(500), nullable=False)
    original_filename = Column(String(255), nullable=True)

    # HOMR emits MusicXML, so this column is honestly named.
    musicxml = Column(Text, nullable=True)
    pieces_json = Column(JSON, nullable=True)
    # Per-page recognition results, kept so the user can re-cut the piece
    # boundaries without re-running recognition.
    pages_json = Column(JSON, nullable=True)
    # Musical problems found in the recognised score, keyed by measure, so the
    # editor can point the user straight at what needs checking.
    warnings_json = Column(JSON, nullable=True)

    progress_current = Column(Integer, nullable=False, default=0)
    progress_total = Column(Integer, nullable=False, default=0)

    # Queue bookkeeping. claimed_at lets an abandoned job be recognised as
    # abandoned and requeued instead of hanging in "processing" for ever.
    claimed_at = Column(DateTime(timezone=True), nullable=True)
    attempts = Column(Integer, nullable=False, default=0)

    error = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
