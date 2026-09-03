"""OCR worker loop.

Runs inside the API process by default (:func:`start_background_worker`) and can
also be run on its own::

    python -m app.worker

Running it separately is the point of the database-backed queue: recognition is
CPU-bound and would otherwise compete with request handling, and a separate
container can be given more CPU, a GPU, or simply be scaled to more replicas.
"""

from __future__ import annotations

import logging
import signal
import threading
import time

from . import jobqueue
from .database import SessionLocal, ensure_schema
from .services.ocr_service import process_ocr_job

logger = logging.getLogger(__name__)

POLL_SECONDS = 2.0
STALE_SWEEP_SECONDS = 300.0


class Worker:
    def __init__(self, poll_seconds: float = POLL_SECONDS) -> None:
        self.poll_seconds = poll_seconds
        self._stop = threading.Event()
        self._last_sweep = 0.0

    def stop(self) -> None:
        self._stop.set()

    def run(self) -> None:
        logger.info("OCR worker %s starting", jobqueue.worker_identity())
        while not self._stop.is_set():
            try:
                did_work = self._tick()
            except Exception:
                # A crash here must never take the loop down, or the queue
                # stops draining silently.
                logger.exception("OCR worker tick failed")
                did_work = False
            if not did_work:
                self._stop.wait(self.poll_seconds)
        logger.info("OCR worker stopped")

    def _tick(self) -> bool:
        now = time.monotonic()
        if now - self._last_sweep > STALE_SWEEP_SECONDS:
            self._last_sweep = now
            db = SessionLocal()
            try:
                jobqueue.requeue_stale(db)
            finally:
                db.close()

        db = SessionLocal()
        try:
            job = jobqueue.claim_next(db)
            if job is None:
                return False
            job_id = job.id
        finally:
            db.close()

        # A fresh session for the job itself: recognition can take minutes and
        # should not hold a connection open across the claim.
        db = SessionLocal()
        try:
            process_ocr_job(db, job_id)
        finally:
            db.close()
        return True


def start_background_worker() -> Worker:
    """Start the worker on a daemon thread inside the current process."""
    worker = Worker()
    thread = threading.Thread(target=worker.run, name="ocr-worker", daemon=True)
    thread.start()
    return worker


def main() -> None:
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s"
    )
    ensure_schema()

    db = SessionLocal()
    try:
        requeued = jobqueue.requeue_stale(db)
        if requeued:
            logger.info("Requeued %d job(s) left behind by a previous run", requeued)
    finally:
        db.close()

    worker = Worker()

    def handle_signal(signum, _frame):
        logger.info("Received signal %s, finishing current job", signum)
        worker.stop()

    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)
    worker.run()


if __name__ == "__main__":
    main()
