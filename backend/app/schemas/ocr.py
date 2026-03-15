from typing import Any

from pydantic import BaseModel


class OcrJobOut(BaseModel):
    id: int
    status: str
    score_data: dict[str, Any] | None = None
    error: str | None = None

    class Config:
        from_attributes = True
