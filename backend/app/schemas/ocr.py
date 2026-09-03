from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class OcrPiece(BaseModel):
    title: str
    musicxml: str
    pages: list[int]
    measures: int = 0
    consistency: float = 0.0
    warnings: list[dict[str, Any]] = []
    warning_counts: dict[str, int] = {}


class OcrPageOut(BaseModel):
    """One recognised page, without its notation.

    The notation is omitted on purpose: a 15-page job would otherwise send the
    same megabytes twice, once per page and once per assembled piece.
    """

    page: int
    variant: str = ""
    consistency: float = 0.0
    staff_count: int = 0
    title: str = ""
    ends_piece: bool = False
    image_problems: list[str] = []


class OcrProgress(BaseModel):
    current: int = 0
    total: int = 0

    @property
    def percent(self) -> int:
        if not self.total:
            return 0
        return int(round(100 * self.current / self.total))


class OcrJobSummaryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    status: str
    original_filename: str | None = None
    progress: OcrProgress = OcrProgress()
    error: str | None = None
    created_at: datetime | None = None

    @classmethod
    def from_job(cls, job) -> "OcrJobSummaryOut":
        return cls(
            id=job.id,
            status=job.status,
            original_filename=job.original_filename,
            progress=OcrProgress(
                current=job.progress_current or 0, total=job.progress_total or 0
            ),
            error=job.error,
            created_at=job.created_at,
        )


class OcrJobOut(OcrJobSummaryOut):
    musicxml: str | None = None
    pieces: list[OcrPiece] | None = None
    pages: list[OcrPageOut] = []
    warnings: list[dict[str, Any]] = []
    suggested_boundaries: list[int] = []

    @classmethod
    def from_job(cls, job) -> "OcrJobOut":
        pieces = None
        if job.pieces_json:
            pieces = [OcrPiece(**piece) for piece in job.pieces_json]

        pages: list[OcrPageOut] = []
        if job.pages_json:
            for page in job.pages_json:
                data = {k: v for k, v in page.items() if k != "musicxml"}
                pages.append(OcrPageOut(**data))

        boundaries: list[int] = []
        if pieces:
            boundaries = [piece.pages[0] for piece in pieces if piece.pages]

        return cls(
            id=job.id,
            status=job.status,
            original_filename=job.original_filename,
            progress=OcrProgress(
                current=job.progress_current or 0, total=job.progress_total or 0
            ),
            error=job.error,
            created_at=job.created_at,
            musicxml=job.musicxml,
            pieces=pieces,
            pages=pages,
            warnings=job.warnings_json or [],
            suggested_boundaries=boundaries,
        )


class OcrLimitsOut(BaseModel):
    max_upload_bytes: int
    max_pages: int
    accepted_types: list[str]


class ImageQualityOut(BaseModel):
    usable: bool
    message: str
    report: dict[str, Any] = {}


class SplitRequest(BaseModel):
    """Page numbers where each piece starts."""

    boundaries: list[int] = Field(min_length=1)
