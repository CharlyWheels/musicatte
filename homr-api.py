"""HTTP wrapper around HOMR.

The previous version drove HOMR by overwriting ``sys.argv`` and calling its
CLI entry point inside ``try: ... except SystemExit: pass``. That swallowed
every real failure -- a missing model, an unreadable image, an out-of-memory
kill -- and reported all of them to the user as the same
"no MusicXML produced", with nothing in the logs to distinguish them.

Two other things changed here:

* Recognition is serialised with a lock. One process holding a torch model
  cannot usefully run several inferences at once; without the lock concurrent
  requests thrash and every one of them gets slower.
* Images arrive already preprocessed by the backend, so this service does no
  image work of its own beyond writing bytes to a temporary file.
"""

import logging
import os
import tempfile
import threading
import traceback
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("homr-api")

app = FastAPI(title="HOMR OCR Service")

# One inference at a time. Requests queue instead of competing.
_recognition_lock = threading.Lock()
_LOCK_TIMEOUT_SECONDS = float(os.getenv("HOMR_LOCK_TIMEOUT", "900"))

ACCEPTED = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
}


@app.get("/health")
def health():
    """Reports whether the models are actually loadable.

    The Dockerfile used to download models with ``|| true``, so an image could
    build cleanly and then fail on every single request. A health check that
    only answers "yes" is no use for catching that.
    """
    try:
        _build_config()
    except Exception as exc:
        logger.error("HOMR is not usable: %s", exc)
        return JSONResponse(status_code=503, content={"ok": False, "error": str(exc)})
    return {"ok": True, "busy": _recognition_lock.locked()}


_config = None
_xml_args = None


def _build_config():
    """Build HOMR's ProcessingConfig once, with GPU support if available.

    ``homr.main.main()`` does this from parsed command-line flags; replicating
    it here is what lets us call the library instead of pretending to be a
    shell.
    """
    global _config, _xml_args
    if _config is not None:
        return _config, _xml_args

    from homr.main import ProcessingConfig, download_weights
    from homr.music_xml_generator import XmlGeneratorArguments
    from homr.onnx_providers import coreml_available, cuda_available, rocm_available

    transformer_use_gpu = cuda_available() or rocm_available()
    segnet_use_gpu = transformer_use_gpu or coreml_available()
    logger.info(
        "GPU support: transformer=%s segnet=%s", transformer_use_gpu, segnet_use_gpu
    )

    # Idempotent, and a no-op once the image has the weights baked in.
    download_weights(segnet_use_gpu, transformer_use_gpu, False)
    # Title detection uses a separate OCR model. Enabling title detection
    # without this is a runtime failure on the first page that has a title.
    from homr.title_detection import download_ocr_weights

    download_ocr_weights()

    _config = ProcessingConfig(
        False,  # enable_debug
        False,  # enable_cache
        False,  # write_staff_positions
        False,  # read_staff_positions
        -1,  # selected_staff: all of them
        transformer_use_gpu,
        segnet_use_gpu,
        False,  # coreml_encoder: opt-in, and only useful across many images
        True,  # title_detection
    )
    _xml_args = XmlGeneratorArguments(None, None, None)
    return _config, _xml_args


def _run_homr(input_path: Path) -> Path:
    """Recognise one image, returning the path to the MusicXML it produced."""
    from homr.main import process_image

    config, xml_args = _build_config()
    # process_image returns the path it wrote and raises on failure, so errors
    # arrive as errors rather than as a missing file.
    produced = Path(process_image(str(input_path), config, xml_args))
    if not produced.exists():
        raise RuntimeError("HOMR terminó sin escribir ningún MusicXML")
    return produced


@app.post("/process")
async def process(file: UploadFile = File(...)):
    if file.content_type not in ACCEPTED:
        raise HTTPException(
            status_code=415,
            detail=f"Solo PNG y JPG. Recibido: {file.content_type}",
        )

    payload = await file.read()
    if not payload:
        raise HTTPException(status_code=400, detail="Imagen vacía")

    acquired = _recognition_lock.acquire(timeout=_LOCK_TIMEOUT_SECONDS)
    if not acquired:
        raise HTTPException(
            status_code=503,
            detail="El servicio de reconocimiento está saturado. Inténtalo de nuevo.",
        )
    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            input_path = Path(tmpdir) / f"input{ACCEPTED[file.content_type]}"
            input_path.write_bytes(payload)

            logger.info("Recognising %s (%.1f KB)", file.filename, len(payload) / 1024)
            try:
                musicxml_path = _run_homr(input_path)
            except Exception as exc:
                # Log the trace, return the reason. Both used to be discarded.
                logger.error("Recognition failed: %s\n%s", exc, traceback.format_exc())
                raise HTTPException(
                    status_code=500,
                    detail=f"El reconocimiento falló: {exc}",
                ) from exc

            content = musicxml_path.read_text(encoding="utf-8")
            if not content.strip():
                raise HTTPException(
                    status_code=422,
                    detail="HOMR no encontró notación musical en la imagen",
                )
            logger.info("Recognised %s -> %d bytes of MusicXML", file.filename, len(content))
            return JSONResponse(content={"musicxml": content})
    finally:
        _recognition_lock.release()
