from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from ..config import settings
from ..database import SessionLocal, get_db
from ..deps import get_current_user
from ..models.ocr_job import OcrJob
from ..models.user import User
from ..schemas.ocr import OcrJobOut
from ..services.ocr_service import process_ocr_job

router = APIRouter(prefix="/api/ocr", tags=["ocr"])
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)


def _process_job_in_fresh_session(job_id: int):
    db = SessionLocal()
    try:
        process_ocr_job(db, job_id)
    finally:
        db.close()


@router.post("/jobs", response_model=OcrJobOut)
async def create_job(
    background_tasks: BackgroundTasks,
    image: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _ = current_user
    if image.content_type not in {"image/png", "image/jpeg", "image/jpg", "application/pdf"}:
        raise HTTPException(status_code=400, detail="Only PNG/JPG images and PDF files are supported")
    payload = await image.read()
    if len(payload) > settings.max_upload_bytes:
        raise HTTPException(status_code=400, detail="File too large")

    suffix = Path(image.filename or "upload.jpg").suffix.lower() or ".jpg"
    filename = f"{uuid4().hex}{suffix}"
    path = UPLOAD_DIR / filename
    path.write_bytes(payload)

    job = OcrJob(status="queued", image_path=str(path))
    db.add(job)
    db.commit()
    db.refresh(job)
    background_tasks.add_task(_process_job_in_fresh_session, job.id)
    return OcrJobOut.from_job(job)


@router.get("/jobs/{job_id}", response_model=OcrJobOut)
def get_job(
    job_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _ = current_user
    job = db.get(OcrJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="OCR job not found")
    return OcrJobOut.from_job(job)
