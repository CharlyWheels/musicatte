import logging
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy.orm import Session

from .. import jobqueue
from ..config import settings
from ..database import get_db
from ..deps import get_current_user
from ..models.ocr_job import OcrJob
from ..models.user import User
from ..schemas.ocr import (
    ImageQualityOut,
    OcrJobOut,
    OcrJobSummaryOut,
    OcrLimitsOut,
    SplitRequest,
)
from ..services import ocr_service, preprocess

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ocr", tags=["ocr"])

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

CHUNK_SIZE = 1 << 20  # 1 MiB

# Content types the client may claim. The claim is not trusted: the bytes are
# sniffed below.
ACCEPTED_TYPES = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/webp": ".webp",
    "application/pdf": ".pdf",
}

# (offset, signature, extension)
_SIGNATURES: list[tuple[int, bytes, str]] = [
    (0, b"\x89PNG\r\n\x1a\n", ".png"),
    (0, b"\xff\xd8\xff", ".jpg"),
    (0, b"%PDF", ".pdf"),
]


def _sniff(header: bytes) -> str | None:
    """Identify the upload from its own bytes.

    ``content_type`` is supplied by the client, so on its own it is a request,
    not a fact: it let a caller hand any bytes to the image pipeline by
    labelling them ``image/png``.
    """
    for offset, signature, extension in _SIGNATURES:
        if header[offset : offset + len(signature)] == signature:
            return extension
    if header[:4] == b"RIFF" and header[8:12] == b"WEBP":
        return ".webp"
    return None


async def _store_upload(upload: UploadFile) -> tuple[Path, int, str]:
    """Stream an upload to disk, refusing to buffer more than the limit.

    The previous version did ``await image.read()`` and then checked the
    length, so an oversized upload was already fully in memory by the time it
    was rejected.
    """
    if upload.content_type not in ACCEPTED_TYPES:
        raise HTTPException(
            status_code=415,
            detail=(
                "Formato no admitido. Sube una foto JPG, PNG o WEBP, o un PDF "
                "con la partitura escaneada."
            ),
        )

    limit = settings.max_upload_bytes
    temp_path = UPLOAD_DIR / f"{uuid4().hex}.part"
    total = 0
    header = b""

    try:
        with temp_path.open("wb") as handle:
            while True:
                chunk = await upload.read(CHUNK_SIZE)
                if not chunk:
                    break
                if not header:
                    header = chunk[:16]
                total += len(chunk)
                if total > limit:
                    raise HTTPException(
                        status_code=413,
                        detail=(
                            f"El archivo pesa más de {limit // (1024 * 1024)} MB. "
                            "Hazle una foto con menos resolución o recórtala antes de subirla."
                        ),
                    )
                handle.write(chunk)

        if total == 0:
            raise HTTPException(status_code=400, detail="El archivo está vacío.")

        extension = _sniff(header)
        if extension is None:
            raise HTTPException(
                status_code=415,
                detail=(
                    "El archivo no parece una imagen ni un PDF. Comprueba que has "
                    "elegido la foto correcta."
                ),
            )

        final_path = temp_path.with_suffix(extension)
        temp_path.rename(final_path)
        return final_path, total, extension
    except Exception:
        temp_path.unlink(missing_ok=True)
        raise


def _owned_job(db: Session, job_id: int, user: User) -> OcrJob:
    job = db.get(OcrJob, job_id)
    if not job or job.user_id != user.id:
        # 404, not 403: a 403 would confirm the id exists, which is all an
        # attacker needs to enumerate other people's scans.
        raise HTTPException(status_code=404, detail="Escaneo no encontrado")
    return job


@router.get("/limits", response_model=OcrLimitsOut)
def limits():
    """What the client may upload.

    Served rather than hardcoded so the scanner cannot claim 8 MB while the
    server allows 16, which is what used to happen.
    """
    return OcrLimitsOut(
        max_upload_bytes=settings.max_upload_bytes,
        max_pages=settings.ocr_max_pages,
        accepted_types=sorted(set(ACCEPTED_TYPES) - {"image/jpg"}),
    )


@router.post("/analyze", response_model=ImageQualityOut)
async def analyze_photo(
    image: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """Judge a photo without recognising it.

    Two seconds of feedback instead of two minutes of waiting for a result
    that was never going to work.
    """
    _ = current_user
    path, size, extension = await _store_upload(image)
    try:
        if extension == ".pdf":
            return ImageQualityOut(
                usable=True,
                message="PDF recibido. Se analizará página por página.",
                report={},
            )
        report = preprocess.analyze(path.read_bytes())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    finally:
        path.unlink(missing_ok=True)

    _ = size
    return ImageQualityOut(
        usable=report.looks_like_sheet_music and "desenfocada" not in report.problems,
        message=_quality_message(report),
        report=report.to_dict(),
    )


def _quality_message(report: preprocess.ImageReport) -> str:
    if not report.looks_like_sheet_music:
        return (
            "No encontramos pentagramas en la foto. Comprueba que se ve la "
            "partitura completa y que no está muy inclinada."
        )
    if "desenfocada" in report.problems:
        return "La foto está desenfocada. Sujeta el móvil con las dos manos y repítela."
    if "resolución baja" in report.problems:
        return "La foto tiene poca resolución. Acércate a la partitura y repítela."
    if "torcida" in report.problems:
        return "La foto está muy torcida y no hemos podido enderezarla del todo."
    detected = f"{report.staff_count} pentagrama{'s' if report.staff_count != 1 else ''}"
    return f"Buena foto: {detected} detectados."


@router.post("/jobs", response_model=OcrJobOut, status_code=status.HTTP_201_CREATED)
async def create_job(
    image: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    path, size, _extension = await _store_upload(image)
    job = OcrJob(
        user_id=current_user.id,
        status="queued",
        image_path=str(path),
        original_filename=(image.filename or "")[:255] or None,
        progress_current=0,
        progress_total=0,
        attempts=0,
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    logger.info(
        "Queued OCR job %d for user %d (%s, %.1f MB)",
        job.id,
        current_user.id,
        job.original_filename or "sin nombre",
        size / (1024 * 1024),
    )
    return OcrJobOut.from_job(job)


@router.get("/jobs", response_model=dict)
def list_jobs(
    limit: int = Query(default=10, ge=1, le=50),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    jobs = (
        db.query(OcrJob)
        .filter(OcrJob.user_id == current_user.id)
        .order_by(OcrJob.id.desc())
        .limit(limit)
        .all()
    )
    return {"items": [OcrJobSummaryOut.from_job(job).model_dump(mode="json") for job in jobs]}


@router.get("/jobs/{job_id}", response_model=OcrJobOut)
def get_job(
    job_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return OcrJobOut.from_job(_owned_job(db, job_id, current_user))


@router.post("/jobs/{job_id}/split", response_model=OcrJobOut)
def resplit_job(
    job_id: int,
    payload: SplitRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Re-cut the piece boundaries without re-running recognition.

    Automatic detection proposes the cuts; this is how the user corrects them.
    A wrong automatic split is worse than none, so the user always gets the
    last word -- and re-cutting is instant because every page's result is
    stored.
    """
    job = _owned_job(db, job_id, current_user)
    if job.status != "succeeded" or not job.pages_json:
        raise HTTPException(
            status_code=409,
            detail="Este escaneo todavía no tiene páginas reconocidas que separar.",
        )

    pages = [
        ocr_service.PageResult(
            page=int(page["page"]),
            musicxml=page["musicxml"],
            variant=page.get("variant", ""),
            consistency=float(page.get("consistency", 0)),
            staff_count=int(page.get("staff_count", 0)),
            title=page.get("title", ""),
            ends_piece=bool(page.get("ends_piece")),
            image_problems=list(page.get("image_problems", [])),
        )
        for page in job.pages_json
    ]
    valid_pages = {p.page for p in pages}
    boundaries = sorted({b for b in payload.boundaries if b in valid_pages})
    if not boundaries:
        raise HTTPException(
            status_code=400,
            detail="Indica al menos una página de inicio que exista en el documento.",
        )

    pieces = ocr_service.build_pieces(pages, boundaries)
    if not pieces:
        raise HTTPException(status_code=400, detail="Esa separación no produce ninguna pieza.")

    job.pieces_json = pieces
    job.musicxml = pieces[0]["musicxml"]
    job.warnings_json = pieces[0]["warnings"]
    db.commit()
    db.refresh(job)
    return OcrJobOut.from_job(job)


@router.delete("/jobs/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_job(
    job_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    job = _owned_job(db, job_id, current_user)
    if job.image_path:
        Path(job.image_path).unlink(missing_ok=True)
    db.delete(job)
    db.commit()
    return None


@router.post("/jobs/{job_id}/retry", response_model=OcrJobOut)
def retry_job(
    job_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    job = _owned_job(db, job_id, current_user)
    if job.status not in ("failed", "succeeded"):
        raise HTTPException(status_code=409, detail="Este escaneo ya se está procesando.")
    if not Path(job.image_path).exists():
        raise HTTPException(
            status_code=410,
            detail="El archivo original ya no está disponible. Vuelve a subirlo.",
        )
    job.attempts = 0
    job.error = None
    job.progress_current = 0
    job.progress_total = 0
    jobqueue.enqueue(db, job)
    db.refresh(job)
    return OcrJobOut.from_job(job)
