from typing import Any

from pydantic import BaseModel


class OcrPiece(BaseModel):
    title: str
    musicxml: str
    pages: list[int]


class OcrJobOut(BaseModel):
    id: int
    status: str
    musicxml: str | None = None
    pieces: list[OcrPiece] | None = None
    error: str | None = None

    class Config:
        from_attributes = True

    @classmethod
    def from_job(cls, job) -> "OcrJobOut":
        pieces = None
        if job.pieces_json:
            pieces = [OcrPiece(**p) for p in job.pieces_json]
        return cls(
            id=job.id,
            status=job.status,
            musicxml=job.musicxml,
            pieces=pieces,
            error=job.error,
        )
