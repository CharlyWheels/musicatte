"""Recognise sheet music from photos and PDFs.

The pipeline, in order:

1. Preprocess the photo (:mod:`app.services.preprocess`). This is where most
   of the accuracy comes from -- the model used to be handed raw camera output.
2. Run recognition on more than one preprocessed variant and keep whichever
   result adds up musically (:mod:`app.services.music_validation`). No ground
   truth needed, so it works in production.
3. Validate the winner and attach warnings keyed by measure number, so the
   editor can point the user at the bars worth checking.
4. For multi-page documents, merge pages without losing key or time changes,
   and propose piece boundaries the user can correct by hand.
"""

from __future__ import annotations

import logging
import tempfile
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from fractions import Fraction
from pathlib import Path
from typing import Callable

import httpx
from sqlalchemy.orm import Session

from ..config import settings
from ..models.ocr_job import OcrJob
from . import music_validation, preprocess

logger = logging.getLogger(__name__)

ProgressFn = Callable[[int, int, str], None]


class OcrFailed(RuntimeError):
    """Recognition could not produce a usable score."""


# ─────────────────────────── HOMR transport ───────────────────────────


def _send_to_homr(png: bytes, name: str) -> str:
    """Send one preprocessed page to HOMR and return its MusicXML."""
    try:
        response = httpx.post(
            f"{settings.homr_url}/process",
            files={"file": (f"{name}.png", png, "image/png")},
            timeout=settings.homr_timeout_seconds,
        )
    except httpx.TimeoutException as exc:
        raise OcrFailed(
            "El reconocimiento tardó demasiado. Prueba con una sola página o una "
            "foto de menor resolución."
        ) from exc
    except httpx.HTTPError as exc:
        raise OcrFailed(f"No se pudo contactar con el servicio de reconocimiento: {exc}") from exc

    if response.status_code != 200:
        detail = _homr_detail(response)
        raise OcrFailed(f"El servicio de reconocimiento falló: {detail}")

    musicxml = (response.json() or {}).get("musicxml", "")
    if not musicxml.strip():
        raise OcrFailed("El reconocimiento no encontró notación en la imagen.")
    return musicxml


def _homr_detail(response: httpx.Response) -> str:
    try:
        payload = response.json()
    except ValueError:
        return f"HTTP {response.status_code}"
    if isinstance(payload, dict):
        return str(payload.get("detail") or payload.get("error") or f"HTTP {response.status_code}")
    return f"HTTP {response.status_code}"


# ─────────────────────────── page recognition ───────────────────────────


@dataclass
class PageResult:
    page: int
    musicxml: str
    variant: str
    consistency: float
    staff_count: int
    title: str
    ends_piece: bool
    image_problems: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "page": self.page,
            "musicxml": self.musicxml,
            "variant": self.variant,
            "consistency": round(self.consistency, 3),
            "staff_count": self.staff_count,
            "title": self.title,
            "ends_piece": self.ends_piece,
            "image_problems": list(self.image_problems),
        }


def recognise_page(payload: bytes, page_number: int = 1) -> PageResult:
    """Recognise one page, trying several preprocessed variants.

    Running two passes costs twice the time and buys a measurable accuracy
    win: which preprocessing a given photo needs is not knowable in advance,
    so the honest approach is to try the plausible ones and keep the result
    whose rhythm adds up.
    """
    variants, report = preprocess.build_variants(payload, limit=settings.ocr_variants)
    if not report.looks_like_sheet_music:
        logger.warning("Page %d: no staves detected before recognition", page_number)

    best: PageResult | None = None
    failures: list[str] = []

    for variant in variants:
        try:
            musicxml = _send_to_homr(variant.png, f"page{page_number}-{variant.name}")
        except OcrFailed as exc:
            failures.append(f"{variant.name}: {exc}")
            continue

        consistency = music_validation.rhythmic_consistency(musicxml)
        logger.info(
            "Page %d variant %s: rhythmic consistency %.2f",
            page_number,
            variant.name,
            consistency,
        )
        candidate = PageResult(
            page=page_number,
            musicxml=musicxml,
            variant=variant.name,
            consistency=consistency,
            staff_count=report.staff_count,
            title=_page_title(musicxml),
            ends_piece=_ends_with_final_barline(musicxml),
            image_problems=report.problems,
        )
        if best is None or candidate.consistency > best.consistency:
            best = candidate
        # A page where every measure adds up leaves nothing for another
        # variant to improve on.
        if best.consistency >= 0.999:
            break

    if best is None:
        hint = "; ".join(failures) if failures else "sin detalles"
        raise OcrFailed(f"No se pudo reconocer la página {page_number} ({hint}).")
    return best


# ─────────────────────────── document structure ───────────────────────────


def _page_title(musicxml: str) -> str:
    """The work or movement title, if the recogniser found one.

    Deliberately does not fall back to ``identification/creator``: that is the
    composer, and using it as a title made every page look like it had one,
    which broke piece detection in the other direction.
    """
    try:
        root = ET.fromstring(musicxml)
    except ET.ParseError:
        return ""
    for path in ("work/work-title", "movement-title"):
        element = root.find(path)
        if element is not None and element.text and element.text.strip():
            return element.text.strip()
    return ""


_GENERIC_TITLES = {"", "untitled", "sin título", "sin titulo", "score", "sheet music", "musicatte"}


def _is_meaningful_title(title: str) -> bool:
    return bool(title) and title.strip().lower() not in _GENERIC_TITLES


_FINAL_BAR_STYLES = {"light-heavy", "heavy-light", "heavy-heavy", "light-light"}


def _ends_with_final_barline(musicxml: str) -> bool:
    """Whether the page closes with a final or double barline.

    A far better piece boundary signal than a title change: recognisers rarely
    read titles, but they do read the thick double bar that ends a piece.
    """
    try:
        root = ET.fromstring(musicxml)
    except ET.ParseError:
        return False
    last_measure = None
    for part in root.findall("part"):
        measures = part.findall("measure")
        if measures:
            last_measure = measures[-1]
    if last_measure is None:
        return False
    for barline in last_measure.findall("barline"):
        if barline.get("location", "right") != "right":
            continue
        style = barline.find("bar-style")
        if style is not None and (style.text or "").strip() in _FINAL_BAR_STYLES:
            return True
    return False


def suggest_boundaries(pages: list[PageResult]) -> list[int]:
    """Page numbers where a new piece probably starts (always includes 1).

    Three signals, in order of reliability: the previous page ended with a
    final barline, the number of staves on the page changed (a solo part does
    not become a grand staff mid-piece), and the title changed. The previous
    implementation used only the last of those, and since titles are almost
    never recognised it never split anything.

    These are suggestions. The user confirms them against page thumbnails,
    because a wrong automatic split is worse than no split at all.
    """
    if not pages:
        return []
    boundaries = [pages[0].page]
    for previous, current in zip(pages, pages[1:]):
        reasons = []
        if previous.ends_piece:
            reasons.append("barra final")
        if (
            previous.staff_count
            and current.staff_count
            and previous.staff_count != current.staff_count
        ):
            reasons.append("cambia el número de pentagramas")
        if (
            _is_meaningful_title(current.title)
            and _is_meaningful_title(previous.title)
            and current.title != previous.title
        ):
            reasons.append("cambia el título")
        elif _is_meaningful_title(current.title) and not _is_meaningful_title(previous.title):
            reasons.append("aparece un título")
        if reasons:
            logger.info("Piece boundary before page %d: %s", current.page, ", ".join(reasons))
            boundaries.append(current.page)
    return boundaries


# ─────────────────────────── merging pages ───────────────────────────

_DURATION_TAGS = {"duration"}


def _document_divisions(root: ET.Element) -> int:
    for part in root.findall("part"):
        for measure in part.findall("measure"):
            attributes = measure.find("attributes")
            if attributes is None:
                continue
            divisions = attributes.find("divisions")
            if divisions is not None and (divisions.text or "").strip():
                try:
                    return max(1, int(float(divisions.text.strip())))
                except ValueError:
                    continue
    return 1


def _rescale_divisions(root: ET.Element, target: int) -> None:
    """Put a document on a common divisions value, scaling every duration.

    Pages recognised independently can each pick their own ``<divisions>``.
    Concatenating their measures without rescaling silently reinterprets every
    rhythm on the later pages -- a quarter note becomes a half, and the whole
    score is wrong in a way that looks plausible.
    """
    for part in root.findall("part"):
        current = 0
        for measure in part.findall("measure"):
            attributes = measure.find("attributes")
            if attributes is not None:
                divisions = attributes.find("divisions")
                if divisions is not None and (divisions.text or "").strip():
                    try:
                        current = max(1, int(float(divisions.text.strip())))
                    except ValueError:
                        current = current or 1
                    divisions.text = str(target)
            if not current or current == target:
                continue
            factor = Fraction(target, current)
            for element in measure.iter():
                if element.tag in _DURATION_TAGS and (element.text or "").strip():
                    try:
                        value = Fraction(int(float(element.text.strip()))) * factor
                    except ValueError:
                        continue
                    element.text = str(int(value)) if value.denominator == 1 else str(round(float(value)))


def _attribute_state(attributes: ET.Element | None, state: dict) -> dict:
    """Fold an ``<attributes>`` block into the running score state."""
    if attributes is None:
        return state
    updated = dict(state)
    key = attributes.find("key/fifths")
    if key is not None and key.text:
        updated["fifths"] = key.text.strip()
    beats = attributes.find("time/beats")
    beat_type = attributes.find("time/beat-type")
    if beats is not None and beats.text:
        updated["beats"] = beats.text.strip()
    if beat_type is not None and beat_type.text:
        updated["beat_type"] = beat_type.text.strip()
    staves = attributes.find("staves")
    if staves is not None and staves.text:
        updated["staves"] = staves.text.strip()
    clefs = {}
    for clef in attributes.findall("clef"):
        number = clef.get("number", "1")
        sign = clef.findtext("sign", "")
        line = clef.findtext("line", "")
        clefs[number] = f"{sign}{line}"
    if clefs:
        updated["clefs"] = {**updated.get("clefs", {}), **clefs}
    return updated


def _prune_redundant_attributes(
    measure: ET.Element, attributes: ET.Element, state: dict
) -> None:
    """Drop only the attribute children that repeat the running state.

    The previous implementation removed each page's whole first ``<attributes>``
    block, which threw away every genuine key and time change that happened at
    a page break.
    """
    key = attributes.find("key")
    if key is not None:
        fifths = key.findtext("fifths", "").strip()
        if fifths and fifths == state.get("fifths"):
            attributes.remove(key)

    time_el = attributes.find("time")
    if time_el is not None:
        beats = time_el.findtext("beats", "").strip()
        beat_type = time_el.findtext("beat-type", "").strip()
        if beats and beats == state.get("beats") and beat_type == state.get("beat_type"):
            attributes.remove(time_el)

    for clef in list(attributes.findall("clef")):
        number = clef.get("number", "1")
        signature = f"{clef.findtext('sign', '')}{clef.findtext('line', '')}"
        if state.get("clefs", {}).get(number) == signature:
            attributes.remove(clef)

    staves = attributes.find("staves")
    if staves is not None and (staves.text or "").strip() == state.get("staves"):
        attributes.remove(staves)

    # Divisions are already uniform across the merged document.
    divisions = attributes.find("divisions")
    if divisions is not None and state.get("divisions_seen"):
        attributes.remove(divisions)

    if len(attributes) == 0:
        measure.remove(attributes)


def merge_pages(pages: list[str]) -> str:
    """Concatenate recognised pages into one score."""
    if not pages:
        raise OcrFailed("No hay páginas para unir.")
    if len(pages) == 1:
        return _sanitize(pages[0])

    roots = []
    for xml in pages:
        try:
            roots.append(ET.fromstring(xml))
        except ET.ParseError:
            logger.warning("Skipping a page that is not valid XML")
    if not roots:
        raise OcrFailed("Ninguna de las páginas reconocidas es XML válido.")

    target_divisions = max(_document_divisions(root) for root in roots)
    for root in roots:
        _rescale_divisions(root, target_divisions)

    base = roots[0]
    base_parts: dict[str, ET.Element] = {
        part.get("id", ""): part for part in base.findall("part")
    }
    if not base_parts:
        raise OcrFailed("La primera página no contiene ninguna parte.")

    state: dict = {"divisions_seen": True}
    for part in base.findall("part"):
        for measure in part.findall("measure"):
            state = _attribute_state(measure.find("attributes"), state)

    next_number = _last_measure_number(base) + 1

    for root in roots[1:]:
        page_start = next_number
        for page_part in root.findall("part"):
            target = base_parts.get(page_part.get("id", "")) or next(iter(base_parts.values()))
            for offset, measure in enumerate(page_part.findall("measure")):
                measure.set("number", str(page_start + offset))
                attributes = measure.find("attributes")
                if attributes is not None:
                    new_state = _attribute_state(attributes, state)
                    _prune_redundant_attributes(measure, attributes, state)
                    state = new_state
                target.append(measure)
                next_number = max(next_number, page_start + offset + 1)

    return _sanitize(ET.tostring(base, encoding="unicode", xml_declaration=True))


def _last_measure_number(root: ET.Element) -> int:
    highest = 0
    for part in root.findall("part"):
        for measure in part.findall("measure"):
            try:
                highest = max(highest, int(measure.get("number", "0")))
            except ValueError:
                continue
    return highest


# ─────────────────────────── XML hygiene ───────────────────────────


def _sanitize(xml_str: str) -> str:
    """Fix structural problems that stop renderers from loading the file.

    Structural only. Whether the *music* is right is
    :mod:`app.services.music_validation`'s job.
    """
    root = ET.fromstring(xml_str)

    if not root.get("version"):
        root.set("version", "3.1")

    defaults = root.find("defaults")
    if defaults is not None and len(defaults) == 0:
        root.remove(defaults)

    for part in root.findall("part"):
        for measure in part.findall("measure"):
            _merge_duplicate_attributes(measure)
            _fix_chords_and_notations(measure)
            _drop_out_of_range_staff_refs(measure)

    return ET.tostring(root, encoding="unicode", xml_declaration=True)


def _merge_duplicate_attributes(measure: ET.Element) -> None:
    blocks = measure.findall("attributes")
    if len(blocks) <= 1:
        return
    first = blocks[0]
    for extra in blocks[1:]:
        for child in list(extra):
            existing = first.find(child.tag)
            if existing is not None:
                first.remove(existing)
            first.append(child)
        measure.remove(extra)


def _fix_chords_and_notations(measure: ET.Element) -> None:
    previous_was_rest = False
    for note in measure.findall("note"):
        chord = note.find("chord")
        is_rest = note.find("rest") is not None

        # A chord member after a rest is not representable; make it a note of
        # its own rather than dropping it.
        if chord is not None and previous_was_rest:
            note.remove(chord)
            chord = None

        previous_was_rest = is_rest and chord is None

        notations = note.find("notations")
        if notations is not None and len(notations) == 0:
            note.remove(notations)


def _drop_out_of_range_staff_refs(measure: ET.Element) -> None:
    attributes = measure.find("attributes")
    staves = 1
    if attributes is not None:
        staves_el = attributes.find("staves")
        if staves_el is not None and (staves_el.text or "").strip():
            try:
                staves = max(1, int(staves_el.text.strip()))
            except ValueError:
                staves = 1
    for note in measure.findall("note"):
        staff_el = note.find("staff")
        if staff_el is None or not (staff_el.text or "").strip():
            continue
        try:
            if int(staff_el.text.strip()) > staves:
                note.remove(staff_el)
        except ValueError:
            note.remove(staff_el)


# ─────────────────────────── PDF handling ───────────────────────────


def pdf_to_images(pdf_path: Path, output_dir: Path) -> list[Path]:
    """Render each PDF page to PNG at 300 dpi."""
    import fitz  # PyMuPDF

    paths: list[Path] = []
    with fitz.open(str(pdf_path)) as document:
        for index in range(len(document)):
            page = document.load_page(index)
            pixmap = page.get_pixmap(matrix=fitz.Matrix(300 / 72, 300 / 72))
            path = output_dir / f"page_{index + 1:04d}.png"
            pixmap.save(str(path))
            paths.append(path)
    return paths


# ─────────────────────────── assembling pieces ───────────────────────────


def build_pieces(pages: list[PageResult], boundaries: list[int]) -> list[dict]:
    """Group recognised pages into pieces at the given start pages."""
    if not pages:
        return []
    starts = sorted({b for b in boundaries if any(p.page == b for p in pages)})
    if not starts or starts[0] != pages[0].page:
        starts = [pages[0].page] + [s for s in starts if s != pages[0].page]

    pieces: list[dict] = []
    for index, start in enumerate(starts):
        end = starts[index + 1] if index + 1 < len(starts) else None
        group = [p for p in pages if p.page >= start and (end is None or p.page < end)]
        if not group:
            continue
        merged = merge_pages([p.musicxml for p in group])
        title = next((p.title for p in group if _is_meaningful_title(p.title)), "")
        summary = music_validation.summarise(merged)
        pieces.append(
            {
                "title": title or f"Pieza {len(pieces) + 1}",
                "musicxml": merged,
                "pages": [p.page for p in group],
                "measures": summary["measures"],
                "consistency": summary["consistency"],
                "warnings": summary["warnings"],
                "warning_counts": summary["counts"],
            }
        )
    return pieces


# ─────────────────────────── job runner ───────────────────────────


def _progress(db: Session, job: OcrJob) -> ProgressFn:
    def report(current: int, total: int, note: str = "") -> None:
        job.progress_current = current
        job.progress_total = total
        db.commit()
        if note:
            logger.info("OCR job %d: %s (%d/%d)", job.id, note, current, total)

    return report


def process_ocr_job(db: Session, job_id: int) -> None:
    job = db.get(OcrJob, job_id)
    if not job:
        logger.warning("OCR job %d disappeared before processing", job_id)
        return

    job.status = "processing"
    job.error = None
    db.commit()
    report = _progress(db, job)

    try:
        image_path = Path(job.image_path)
        if not image_path.exists():
            raise OcrFailed("El archivo subido ya no está disponible. Vuelve a subirlo.")

        if image_path.suffix.lower() == ".pdf":
            pages = _process_pdf(image_path, job_id, report)
        else:
            report(0, 1, "reconociendo la imagen")
            pages = [recognise_page(image_path.read_bytes(), 1)]
            report(1, 1, "listo")

        boundaries = suggest_boundaries(pages)
        pieces = build_pieces(pages, boundaries)
        if not pieces:
            raise OcrFailed("No se reconoció ninguna pieza en el documento.")

        job.pages_json = [p.to_dict() for p in pages]
        job.pieces_json = pieces
        job.musicxml = pieces[0]["musicxml"]
        job.warnings_json = pieces[0]["warnings"]
        job.status = "succeeded"
        db.commit()
        logger.info(
            "OCR job %d succeeded: %d page(s), %d piece(s), consistency %.2f",
            job_id,
            len(pages),
            len(pieces),
            pieces[0]["consistency"],
        )
    except OcrFailed as exc:
        _fail(db, job, str(exc))
    except Exception as exc:  # unexpected: log the trace, show something useful
        logger.exception("OCR job %d crashed", job_id)
        _fail(db, job, f"Error inesperado durante el reconocimiento: {exc}")


def _process_pdf(pdf_path: Path, job_id: int, report: ProgressFn) -> list[PageResult]:
    with tempfile.TemporaryDirectory() as tmpdir:
        images = pdf_to_images(pdf_path, Path(tmpdir))
        if not images:
            raise OcrFailed("El PDF no tiene páginas.")
        if len(images) > settings.ocr_max_pages:
            raise OcrFailed(
                f"El PDF tiene {len(images)} páginas y el máximo es "
                f"{settings.ocr_max_pages}. Sube las piezas por separado."
            )
        logger.info("OCR job %d: PDF has %d page(s)", job_id, len(images))

        pages: list[PageResult] = []
        failures: list[str] = []
        total = len(images)
        for index, image in enumerate(images, 1):
            report(index - 1, total, f"reconociendo la página {index}")
            try:
                pages.append(recognise_page(image.read_bytes(), index))
            except OcrFailed as exc:
                # One unreadable page should not throw away the other fourteen.
                logger.warning("OCR job %d: page %d failed: %s", job_id, index, exc)
                failures.append(f"página {index}")
        report(total, total, "listo")

        if not pages:
            raise OcrFailed(
                "No se pudo reconocer ninguna página. Comprueba que el PDF "
                "contiene partituras escaneadas."
            )
        if failures:
            logger.info("OCR job %d: skipped %s", job_id, ", ".join(failures))
        return pages


def _fail(db: Session, job: OcrJob, message: str) -> None:
    logger.error("OCR job %d failed: %s", job.id, message)
    job.status = "failed"
    job.error = message
    db.commit()
