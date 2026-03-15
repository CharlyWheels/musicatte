import tempfile
import sys
from pathlib import Path
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse

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
            raise HTTPException(status_code=500, detail="OCR processing failed - no MusicXML produced")

        content = musicxml_path.read_text(encoding="utf-8")
        return JSONResponse(content={"musicxml": content})
