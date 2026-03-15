from pydantic import BaseModel, Field


class RatingUpsert(BaseModel):
    value: int = Field(ge=1, le=5)
