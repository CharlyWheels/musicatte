from typing import Any

from pydantic import BaseModel, Field


class ScoreBase(BaseModel):
    title: str
    composer: str | None = None
    instrument: str = "piano"
    genre: str = "general"
    score_data: dict[str, Any]
    status: str = "draft"
    parent_score_id: int | None = None


class ScoreCreate(ScoreBase):
    pass


class ScoreUpdate(ScoreBase):
    version: int = Field(default=1, ge=1)


class ScoreOut(ScoreBase):
    id: int
    user_id: int
    version: int
    avg_rating: float | None = 0

    class Config:
        from_attributes = True
