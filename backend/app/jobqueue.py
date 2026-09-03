"""A durable queue for OCR jobs, backed by the database.

Recognition used to run in a FastAPI ``BackgroundTasks`` callback. A 15-page
PDF is up to half an hour of CPU-bound work inside the web process, and if the
API restarted mid-job the work was lost with the row left in ``processing``
for ever, with nothing to retry it.

The queue lives in the ``ocr_jobs`` table itself, which buys three things
without adding infrastructure:

* **Durability** -- a restart loses nothing; whatever was in flight is
  requeued by :func:`requeue_stale`.
* **Retries** -- ``attempts`` is tracked, so a job that keeps crashing stops
  instead of looping.
* **Scale-out** -- claiming is atomic, so the worker can be run as its own
  process (``python -m app.worker``) and more than one of them at a time.

A dedicated broker (Redis with arq or RQ) is the better answer once throughput
matters; the reason to reach for it would be scheduling features or
cross-service fan-out, not durability, which this already has.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone

from sqlalchemy import text
from sqlalchemy.orm import Session

from .models.ocr_job import OcrJob

logger = logging.getLogger(__name__)

MAX_ATTEMPTS = 3
# A job whose worker has been silent for this long is assumed dead.
STALE_AFTER = timedelta(minutes=45)


def enqueue(db: Session, job: OcrJob) -> None:
    job.status = "queued"
    job.claimed_at = None
    db.commit()


CLAIM_ATTEMPTS = 5


def claim_next(db: Session) -> OcrJob | None:
    """Atomically take the oldest queued job, or return None.

    Claiming is by id, in two steps: pick a candidate, then update it under the
    guard ``status = 'queued'``. The guard is what makes this race-safe without
    a broker -- when two workers pick the same candidate, exactly one sees a
    row affected and the loser tries the next one. (Identifying the claimed row
    by the timestamp just written is tempting and does not work: SQLite and
    Postgres round-trip aware datetimes differently, so the row comes back
    unmatched.)
    """
    for _ in range(CLAIM_ATTEMPTS):
        candidate = (
            db.query(OcrJob.id)
            .filter(OcrJob.status == "queued")
            .order_by(OcrJob.id)
            .limit(1)
            .scalar()
        )
        if candidate is None:
            return None

        result = db.execute(
            text(
                """
                UPDATE ocr_jobs
                   SET status = 'processing',
                       claimed_at = :now,
                       attempts = COALESCE(attempts, 0) + 1
                 WHERE id = :job_id
                   AND status = 'queued'
                """
            ),
            {"now": datetime.now(timezone.utc), "job_id": candidate},
        )
        db.commit()
        if result.rowcount != 1:
            continue  # somebody else got it; try the next queued job

        job = db.get(OcrJob, candidate)
        if job is not None:
            db.refresh(job)
            logger.info("Claimed OCR job %d (attempt %d)", job.id, job.attempts or 1)
        return job

    logger.warning("Gave up claiming a job after %d contended attempts", CLAIM_ATTEMPTS)
    return None


def requeue_stale(db: Session) -> int:
    """Put abandoned jobs back in the queue; give up on repeat offenders.

    Called at worker startup and periodically. Without it, a restart during
    recognition left the user staring at a spinner for ever.
    """
    cutoff = datetime.now(timezone.utc) - STALE_AFTER
    stale = (
        db.query(OcrJob)
        .filter(OcrJob.status == "processing")
        .filter((OcrJob.claimed_at.is_(None)) | (OcrJob.claimed_at < cutoff))
        .all()
    )
    requeued = 0
    for job in stale:
        if (job.attempts or 0) >= MAX_ATTEMPTS:
            job.status = "failed"
            job.error = (
                "El reconocimiento se interrumpió varias veces. Vuelve a subir "
                "el archivo, y si falla otra vez prueba con menos páginas."
            )
            logger.warning("OCR job %d abandoned after %d attempts", job.id, job.attempts)
        else:
            job.status = "queued"
            job.claimed_at = None
            requeued += 1
            logger.info("Requeued stale OCR job %d", job.id)
    if stale:
        db.commit()
    return requeued


def pending_count(db: Session) -> int:
    return db.query(OcrJob).filter(OcrJob.status.in_(("queued", "processing"))).count()


def worker_identity() -> str:
    return f"{os.uname().nodename}:{os.getpid()}"
