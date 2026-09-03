from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

ScoreFormat = Literal["mei", "musicxml"]
ScoreStatus = Literal["draft", "published"]


class _ScoreDataIn(BaseModel):
    """Accepts the notation under its current name or the legacy one.

    Older clients sent ``musicxml``; the field was misnamed because it always
    carried MEI. Both spellings are accepted so an in-flight client keeps
    working, but the format is recorded explicitly from now on.
    """

    score_data: str | None = None
    score_format: ScoreFormat = "mei"
    musicxml: str | None = Field(default=None, deprecated=True)

    @model_validator(mode="after")
    def _coalesce(self):
        if not self.score_data:
            if not self.musicxml:
                raise ValueError("score_data is required")
            self.score_data = self.musicxml
        if not self.score_data.strip():
            raise ValueError("score_data is empty")
        return self


class ScoreCreate(_ScoreDataIn):
    title: str = Field(min_length=1, max_length=255)
    composer: str | None = Field(default=None, max_length=255)
    instrument: str = Field(default="piano", max_length=100)
    genre: str = Field(default="general", max_length=100)
    status: ScoreStatus = "draft"
    parent_score_id: int | None = None


class ScoreUpdate(_ScoreDataIn):
    title: str = Field(min_length=1, max_length=255)
    composer: str | None = Field(default=None, max_length=255)
    instrument: str = Field(default="piano", max_length=100)
    genre: str = Field(default="general", max_length=100)
    # The version the client started editing from. When it is older than the
    # stored one the server rejects the write instead of silently overwriting
    # somebody else's changes.
    base_version: int | None = None


class ScoreMetaUpdate(BaseModel):
    """Metadata-only edit: does not require resending the whole score."""

    title: str = Field(min_length=1, max_length=255)
    composer: str | None = Field(default=None, max_length=255)
    instrument: str = Field(default="piano", max_length=100)
    genre: str = Field(default="general", max_length=100)


class ScoreSummaryOut(BaseModel):
    """Listing shape. Deliberately omits the notation itself.

    A list of 100 scores does not need 100 full documents, and shipping them
    turned every listing into a bulk data export.
    """

    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    composer: str | None = None
    instrument: str
    genre: str
    score_format: ScoreFormat
    status: str
    version: int
    avg_rating: float = 0
    rating_count: int = 0
    created_at: datetime | None = None
    updated_at: datetime | None = None


class ScoreOut(ScoreSummaryOut):
    score_data: str
    user_id: int


class PublicScoreOut(BaseModel):
    """What anyone may read about a published score. No user_id, no email."""

    id: int
    title: str
    composer: str | None = None
    instrument: str
    genre: str
    score_format: ScoreFormat
    score_data: str
    author: str
    avg_rating: float = 0
    rating_count: int = 0
    created_at: datetime | None = None


class ScoreWarningsOut(BaseModel):
    warnings: list[dict[str, Any]] = []


class ImportedScoreOut(BaseModel):
    """A notation file turned into something the editor can open."""

    title: str
    score_data: str
    score_format: ScoreFormat
