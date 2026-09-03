from sqlalchemy import Column, DateTime, Integer, String
from sqlalchemy.sql import func

from ..database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    # Shown next to published scores. Emails are never exposed publicly.
    display_name = Column(String(80), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    @property
    def public_name(self) -> str:
        if self.display_name:
            return self.display_name
        return (self.email or "").split("@")[0] or f"usuario{self.id}"
