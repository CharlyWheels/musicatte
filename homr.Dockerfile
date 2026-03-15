FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    git curl libgl1 libglib2.0-0 && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN pip install --no-cache-dir poetry

RUN git clone https://github.com/liebharc/homr.git /app/homr
WORKDIR /app/homr
RUN poetry config virtualenvs.create false && \
    poetry install --only main

# Pre-download models
RUN poetry run homr --init || true

# Create a minimal FastAPI wrapper
RUN pip install --no-cache-dir fastapi uvicorn python-multipart

COPY <<'APIFILE' /app/homr/api.py
import tempfile
import os
from pathlib import Path
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import FileResponse, JSONResponse

app = FastAPI(title="HOMR OCR Service")

@app.get("/health")
def health():
    return {"ok": True}

@app.post("/process")
async def process(file: UploadFile = File(...)):
    if file.content_type not in ("image/png", "image/jpeg", "image/jpg"):
        raise HTTPException(status_code=400, detail="Only PNG/JPG images supported")

    with tempfile.TemporaryDirectory() as tmpdir:
        suffix = ".jpg" if "jpeg" in (file.content_type or "") or "jpg" in (file.content_type or "") else ".png"
        input_path = Path(tmpdir) / f"input{suffix}"
        input_path.write_bytes(await file.read())

        from homr.main import main as homr_main
        import sys
        old_argv = sys.argv
        sys.argv = ["homr", str(input_path)]
        try:
            homr_main()
        except SystemExit:
            pass
        finally:
            sys.argv = old_argv

        musicxml_path = input_path.with_suffix(".musicxml")
        if not musicxml_path.exists():
            raise HTTPException(status_code=500, detail="OCR processing failed — no MusicXML produced")

        content = musicxml_path.read_text(encoding="utf-8")
        return JSONResponse(content={"musicxml": content})
APIFILE

EXPOSE 8000

CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000"]
