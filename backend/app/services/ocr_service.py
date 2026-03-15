import logging
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path

import httpx
from sqlalchemy.orm import Session

from ..config import settings
from ..models.ocr_job import OcrJob

logger = logging.getLogger(__name__)


def _send_image_to_homr(image_path: Path) -> str:
    """Send a single image file to HOMR and return the MusicXML string."""
    content_type = "image/png" if image_path.suffix.lower() == ".png" else "image/jpeg"
    with open(image_path, "rb") as f:
        response = httpx.post(
            f"{settings.homr_url}/process",
            files={"file": (image_path.name, f, content_type)},
            timeout=120.0,
        )
    if response.status_code != 200:
        raise RuntimeError(f"HOMR returned {response.status_code}: {response.text}")
    data = response.json()
    musicxml = data.get("musicxml", "")
    if not musicxml:
        raise RuntimeError("HOMR returned empty MusicXML")
    return musicxml


def _pdf_to_images(pdf_path: Path, output_dir: Path) -> list[Path]:
    """Convert each page of a PDF to a PNG image using PyMuPDF."""
    import fitz  # PyMuPDF

    doc = fitz.open(str(pdf_path))
    image_paths: list[Path] = []
    for page_num in range(len(doc)):
        page = doc.load_page(page_num)
        mat = fitz.Matrix(300 / 72, 300 / 72)
        pix = page.get_pixmap(matrix=mat)
        img_path = output_dir / f"page_{page_num + 1:04d}.png"
        pix.save(str(img_path))
        image_paths.append(img_path)
    doc.close()
    return image_paths


# ──────── Piece boundary detection ────────


def _get_title(root: ET.Element) -> str:
    """Extract work-title or movement-title from MusicXML."""
    for tag in ("work/work-title", "movement-title", "identification/creator"):
        el = root.find(tag)
        if el is not None and el.text and el.text.strip():
            return el.text.strip()
    return ""


def _get_first_measure_number(root: ET.Element) -> int | None:
    """Get the number attribute of the first measure."""
    part = root.find("part")
    if part is None:
        return None
    measure = part.find("measure")
    if measure is None:
        return None
    try:
        return int(measure.get("number", "1"))
    except ValueError:
        return 1


def _has_full_attributes(root: ET.Element) -> bool:
    """Check if the first measure has a full attributes block (clef + key + time)."""
    part = root.find("part")
    if part is None:
        return False
    measure = part.find("measure")
    if measure is None:
        return False
    attrs = measure.find("attributes")
    if attrs is None:
        return False
    has_clef = attrs.find("clef") is not None
    has_key = attrs.find("key") is not None
    has_time = attrs.find("time") is not None
    return has_clef and has_key and has_time


def _get_last_measure_number(root: ET.Element) -> int:
    """Get the highest measure number in the score."""
    max_num = 0
    for part in root.findall("part"):
        for measure in part.findall("measure"):
            try:
                num = int(measure.get("number", "0"))
                max_num = max(max_num, num)
            except ValueError:
                pass
    return max_num


_GENERIC_TITLES = {"", "untitled", "sin título", "sin titulo", "score", "sheet music"}


def _is_new_piece(prev_root: ET.Element | None, current_root: ET.Element) -> bool:
    """Detect if the current page starts a new piece.

    Since HOMR processes each page independently (always producing measure 1
    with full attributes), we can NOT rely on measure numbers or attributes
    resets. The only reliable signal is a meaningful title change.

    A title is considered meaningful if it is non-empty and not a generic
    placeholder like "Untitled".
    """
    if prev_root is None:
        return True  # First page is always a "new piece"

    current_title = _get_title(current_root).strip()
    prev_title = _get_title(prev_root).strip()

    # Only split if BOTH pages have meaningful (non-generic) titles
    # AND they are different
    if (
        current_title
        and prev_title
        and current_title.lower() not in _GENERIC_TITLES
        and prev_title.lower() not in _GENERIC_TITLES
        and current_title != prev_title
    ):
        logger.info(
            "New piece detected: title change '%s' → '%s'", prev_title, current_title
        )
        return True

    return False


def _sanitize_musicxml(xml_str: str) -> str:
    """Fix common MusicXML issues that trip up renderers like Verovio.

    - Add version attribute to <score-partwise> if missing
    - Merge multiple <attributes> blocks in the same measure into one
    - Remove empty <notations/> elements
    - Fix invalid chord-after-rest sequences
    - Remove empty <defaults/> elements
    """
    root = ET.fromstring(xml_str)

    # Ensure version attribute
    if not root.get("version"):
        root.set("version", "3.1")

    # Remove empty <defaults/>
    defaults = root.find("defaults")
    if defaults is not None and len(defaults) == 0:
        root.remove(defaults)

    for part in root.findall("part"):
        for measure in part.findall("measure"):
            # Merge duplicate <attributes>
            attrs_list = measure.findall("attributes")
            if len(attrs_list) > 1:
                first = attrs_list[0]
                for extra in attrs_list[1:]:
                    for child in list(extra):
                        existing = first.find(child.tag)
                        if existing is not None:
                            first.remove(existing)
                        first.append(child)
                    measure.remove(extra)

            # Fix invalid chord-after-rest: if a <note> has <chord/> but the
            # previous note is a rest, remove the <chord/> element to make it
            # a standalone note instead.
            notes = measure.findall("note")
            prev_is_rest = False
            for note in notes:
                chord_el = note.find("chord")
                is_rest = note.find("rest") is not None

                if chord_el is not None and prev_is_rest:
                    note.remove(chord_el)

                prev_is_rest = is_rest and chord_el is None

                # Remove empty <notations/>
                notations = note.find("notations")
                if notations is not None and len(notations) == 0:
                    note.remove(notations)

            # Remove <staff> references to non-existent staves
            # Count how many staves are defined in <attributes>
            attrs = measure.find("attributes")
            num_staves = 1
            if attrs is not None:
                staves_el = attrs.find("staves")
                if staves_el is not None and staves_el.text:
                    try:
                        num_staves = int(staves_el.text)
                    except ValueError:
                        pass
            for note in notes:
                staff_el = note.find("staff")
                if staff_el is not None and staff_el.text:
                    try:
                        if int(staff_el.text) > num_staves:
                            note.remove(staff_el)
                    except ValueError:
                        pass

    return ET.tostring(root, encoding="unicode", xml_declaration=True)


def _merge_musicxml(musicxml_strings: list[str]) -> str:
    """Merge multiple MusicXML documents into one by concatenating measures."""
    if len(musicxml_strings) == 1:
        return _sanitize_musicxml(musicxml_strings[0])

    base_root = ET.fromstring(musicxml_strings[0])
    base_parts: dict[str, ET.Element] = {}
    for part_el in base_root.findall("part"):
        base_parts[part_el.get("id", "")] = part_el

    next_measure_num = _get_last_measure_number(base_root) + 1

    for xml_str in musicxml_strings[1:]:
        page_root = ET.fromstring(xml_str)
        page_start = next_measure_num

        for page_part in page_root.findall("part"):
            part_id = page_part.get("id", "")
            target = base_parts.get(part_id)
            if target is None and base_parts:
                target = next(iter(base_parts.values()))
            if target is None:
                continue

            for measure in page_part.findall("measure"):
                try:
                    old_num = int(measure.get("number", "1"))
                except ValueError:
                    old_num = 1
                measure.set("number", str(page_start + old_num - 1))
                if old_num == 1:
                    attrs = measure.find("attributes")
                    if attrs is not None:
                        measure.remove(attrs)
                target.append(measure)
                next_measure_num = max(next_measure_num, page_start + old_num)

        next_measure_num += 1

    merged = ET.tostring(base_root, encoding="unicode", xml_declaration=True)
    return _sanitize_musicxml(merged)


def _split_into_pieces(musicxml_per_page: list[str]) -> list[dict]:
    """Split pages into pieces based on boundary detection.

    Returns a list of dicts: [{"title": str, "musicxml": str, "pages": [int]}]
    """
    if not musicxml_per_page:
        return []

    pieces: list[dict] = []
    current_pages: list[str] = []
    current_page_nums: list[int] = []
    prev_root: ET.Element | None = None

    for i, xml_str in enumerate(musicxml_per_page):
        try:
            root = ET.fromstring(xml_str)
        except ET.ParseError:
            # If parsing fails, treat as continuation
            current_pages.append(xml_str)
            current_page_nums.append(i + 1)
            continue

        if _is_new_piece(prev_root, root) and current_pages:
            # Flush the previous piece
            merged = _merge_musicxml(current_pages)
            title = _get_title(ET.fromstring(current_pages[0])) or f"Pieza {len(pieces) + 1}"
            pieces.append({
                "title": title,
                "musicxml": merged,
                "pages": current_page_nums[:],
            })
            current_pages = []
            current_page_nums = []

        current_pages.append(xml_str)
        current_page_nums.append(i + 1)

        # Update prev_root to the LAST page of the current group for continuity check
        prev_root = root

    # Flush final piece
    if current_pages:
        merged = _merge_musicxml(current_pages)
        title = _get_title(ET.fromstring(current_pages[0])) or f"Pieza {len(pieces) + 1}"
        pieces.append({
            "title": title,
            "musicxml": merged,
            "pages": current_page_nums[:],
        })

    return pieces


# ──────── Main job processor ────────


def process_ocr_job(db: Session, job_id: int) -> None:
    job = db.get(OcrJob, job_id)
    if not job:
        return
    job.status = "processing"
    db.commit()
    try:
        image_path = Path(job.image_path)
        if not image_path.exists():
            raise FileNotFoundError(f"File not found: {image_path}")

        if image_path.suffix.lower() == ".pdf":
            with tempfile.TemporaryDirectory() as tmpdir:
                tmpdir_path = Path(tmpdir)
                page_images = _pdf_to_images(image_path, tmpdir_path)
                if len(page_images) > 15:
                    raise ValueError(
                        f"El PDF tiene {len(page_images)} páginas. "
                        "El máximo permitido es 15. Sube piezas individuales."
                    )
                logger.info("OCR job %d: PDF has %d page(s)", job_id, len(page_images))

                musicxml_results: list[str] = []
                for i, page_img in enumerate(page_images, 1):
                    logger.info("OCR job %d: processing page %d/%d", job_id, i, len(page_images))
                    result = _send_image_to_homr(page_img)
                    musicxml_results.append(result)

                pieces = _split_into_pieces(musicxml_results)
                logger.info("OCR job %d: detected %d piece(s)", job_id, len(pieces))

                if len(pieces) == 1:
                    job.musicxml = pieces[0]["musicxml"]
                    job.pieces_json = None
                else:
                    # Multiple pieces: store the first as musicxml and all in pieces_json
                    job.musicxml = pieces[0]["musicxml"]
                    job.pieces_json = [
                        {"title": p["title"], "musicxml": p["musicxml"], "pages": p["pages"]}
                        for p in pieces
                    ]
        else:
            musicxml = _send_image_to_homr(image_path)
            job.musicxml = musicxml
            job.pieces_json = None

        job.status = "succeeded"
        job.error = None
        db.commit()
        logger.info("OCR job %d succeeded", job_id)
    except Exception as exc:
        logger.error("OCR job %d failed: %s", job_id, exc)
        job.status = "failed"
        job.error = str(exc)
        db.commit()
