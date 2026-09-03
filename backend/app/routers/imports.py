"""Import notation files into the editor.

Until now the only ways into the editor were "recognise a photo" or "start
from blank": a musician with an existing MusicXML file had nowhere to put it.
"""

import logging

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from ..config import settings
from ..deps import get_current_user
from ..models.user import User
from ..schemas.score import ImportedScoreOut
from ..services import conversion

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/import", tags=["import"])

CHUNK_SIZE = 1 << 20


@router.post("", response_model=ImportedScoreOut)
async def import_score(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    _ = current_user
    limit = settings.max_upload_bytes
    payload = bytearray()
    while True:
        chunk = await file.read(CHUNK_SIZE)
        if not chunk:
            break
        payload.extend(chunk)
        if len(payload) > limit:
            raise HTTPException(
                status_code=413,
                detail=f"El archivo pesa más de {limit // (1024 * 1024)} MB.",
            )
    if not payload:
        raise HTTPException(status_code=400, detail="El archivo está vacío.")

    try:
        data, score_format = conversion.read_uploaded_score(bytes(payload), file.filename or "")
    except conversion.ConversionError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    title = _guess_title(data, score_format) or _title_from_filename(file.filename or "")
    return ImportedScoreOut(title=title, score_data=data, score_format=score_format)


def _guess_title(data: str, score_format: str) -> str:
    import xml.etree.ElementTree as ET

    try:
        root = ET.fromstring(data)
    except ET.ParseError:
        return ""
    if score_format == "musicxml":
        for path in ("work/work-title", "movement-title"):
            element = root.find(path)
            if element is not None and (element.text or "").strip():
                return element.text.strip()
        return ""
    # MEI keeps its title in the header.
    for element in root.iter():
        if element.tag.endswith("}title") or element.tag == "title":
            if (element.text or "").strip():
                return element.text.strip()
    return ""


def _title_from_filename(filename: str) -> str:
    from pathlib import Path

    stem = Path(filename).stem.replace("_", " ").replace("-", " ").strip()
    return stem[:120] or "Partitura importada"
