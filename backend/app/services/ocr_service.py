import time

from sqlalchemy.orm import Session

from ..models.ocr_job import OcrJob


def sample_score_data(job_id: int) -> dict:
    return {
        "schemaVersion": 1,
        "title": f"OCR Result {job_id}",
        "composer": "OCR Engine",
        "tempo": 100,
        "timeSignature": {"beats": 4, "beatType": 4},
        "keySignature": "C",
        "clef": "treble",
        "measures": [
            {
                "notes": [
                    {"pitch": "C/4", "duration": "q", "accidental": None},
                    {"pitch": "E/4", "duration": "q", "accidental": None},
                    {"pitch": "G/4", "duration": "q", "accidental": None},
                    {"pitch": "C/5", "duration": "q", "accidental": None},
                ]
            }
        ],
        "metadata": {"source": "ocr", "ocrJobId": job_id},
    }


def process_ocr_job(db: Session, job_id: int) -> None:
    job = db.get(OcrJob, job_id)
    if not job:
        return
    job.status = "processing"
    db.commit()
    try:
        # Placeholder for real Audiveris subprocess call.
        time.sleep(2)
        job.score_data = sample_score_data(job_id)
        job.musicxml = "<score-partwise version='3.1'></score-partwise>"
        job.status = "succeeded"
        job.error = None
        db.commit()
    except Exception as exc:
        job.status = "failed"
        job.error = str(exc)
        db.commit()
