from pydantic import BaseModel, Field


class ScoreCreate(BaseModel):
    title: str
    composer: str | None = None
    instrument: str = "piano"
    genre: str = "general"
    musicxml: str
    status: str = "draft"
    parent_score_id: int | None = None


class ScoreUpdate(BaseModel):
    title: str
    composer: str | None = None
    instrument: str = "piano"
    genre: str = "general"
    musicxml: str
    version: int = Field(default=1, ge=1)


class ScoreOut(BaseModel):
    id: int
    title: str
    composer: str | None = None
    instrument: str
    genre: str
    musicxml: str
    user_id: int
    version: int
    status: str
    avg_rating: float = 0

    class Config:
        from_attributes = True
