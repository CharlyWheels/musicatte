import logging
import time
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from . import jobqueue
from .config import settings
from .database import SessionLocal, ensure_schema
from .models import ocr_job, rating, score, user  # noqa: F401
from .routers import auth, imports, ocr, repository, scores
from .worker import start_background_worker

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger(__name__)

UPLOAD_DIR = Path("uploads")


def _sweep_uploads() -> int:
    """Delete uploads nobody needs any more.

    Scans used to accumulate in uploads/ for ever; on a small VPS that is the
    disk filling up quietly until something unrelated fails.
    """
    if not UPLOAD_DIR.exists():
        return 0
    cutoff = datetime.now(timezone.utc) - timedelta(hours=settings.upload_retention_hours)
    removed = 0
    for path in UPLOAD_DIR.iterdir():
        if not path.is_file():
            continue
        try:
            modified = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc)
            if modified < cutoff:
                path.unlink()
                removed += 1
        except OSError:
            logger.warning("Could not remove old upload %s", path)
    return removed


@asynccontextmanager
async def lifespan(app: FastAPI):
    ensure_schema()
    logger.info("Database schema ready")

    db = SessionLocal()
    try:
        requeued = jobqueue.requeue_stale(db)
        if requeued:
            logger.info("Requeued %d OCR job(s) interrupted by a restart", requeued)
    finally:
        db.close()

    removed = _sweep_uploads()
    if removed:
        logger.info("Removed %d upload(s) past the retention window", removed)

    # In the default single-container setup the worker runs here. In production
    # RUN_INLINE_WORKER=0 and `python -m app.worker` runs as its own service
    # (see docker-compose.prod.yml), so recognition does not compete with
    # request handling for CPU.
    worker = start_background_worker() if settings.run_inline_worker else None
    if worker is None:
        logger.info("Inline OCR worker disabled; expecting a separate worker process")
    try:
        yield
    finally:
        if worker is not None:
            worker.stop()


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_request_time(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    elapsed_ms = (time.perf_counter() - start) * 1000
    logger.info("%s %s %d %.1fms", request.method, request.url.path, response.status_code, elapsed_ms)
    return response


@app.get("/health")
def health():
    db = SessionLocal()
    try:
        pending = jobqueue.pending_count(db)
    except Exception:
        logger.exception("Health check could not reach the database")
        return {"ok": False, "database": False}
    finally:
        db.close()
    return {"ok": True, "database": True, "ocr_pending": pending}


app.include_router(auth.router)
app.include_router(scores.router)
app.include_router(ocr.router)
app.include_router(imports.router)
app.include_router(repository.router)
