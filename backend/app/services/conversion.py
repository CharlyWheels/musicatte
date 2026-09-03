"""Notation format conversion.

Verovio -- the engine the editor is built on -- reads MusicXML and MEI but can
only *write* MEI, Humdrum, MIDI, PAE and SVG. So the editor's "export
MusicXML" button used to hand the user a MEI file with an .xml extension, which
no mainstream notation editor opens. Conversion has to happen server-side, and
music21 is the piece that can do it: it reads both MEI and MusicXML and writes
MusicXML, compressed MusicXML and MIDI.

music21 is imported lazily. It pulls in a large dependency tree and startup
time matters more than the first export does.
"""

from __future__ import annotations

import io
import logging
import re
import unicodedata
import zipfile

logger = logging.getLogger(__name__)


class ConversionError(RuntimeError):
    """The document could not be converted (malformed or unsupported content)."""


class UnsupportedFormat(ValueError):
    """The requested format is not one we produce."""


# format -> (media type, file extension)
EXPORT_FORMATS: dict[str, tuple[str, str]] = {
    "musicxml": ("application/vnd.recordare.musicxml+xml", "musicxml"),
    "mxl": ("application/vnd.recordare.musicxml", "mxl"),
    "midi": ("audio/midi", "mid"),
    "mei": ("application/xml", "mei"),
}

IMPORT_FORMATS = ("musicxml", "mxl", "mei", "midi")


def safe_filename(title: str, extension: str) -> str:
    """A filename that survives every filesystem and Content-Disposition."""
    base = unicodedata.normalize("NFKD", title or "partitura")
    base = base.encode("ascii", "ignore").decode("ascii")
    base = re.sub(r"[^A-Za-z0-9 ._-]+", "", base).strip().replace(" ", "-")
    base = re.sub(r"-{2,}", "-", base).strip("-.") or "partitura"
    return f"{base[:80]}.{extension}"


def _parse(data: str, source_format: str):
    """Parse MEI or MusicXML into a music21 stream."""
    from music21 import converter

    fmt = "mei" if source_format == "mei" else "musicxml"
    try:
        return converter.parse(data, format=fmt)
    except Exception as exc:  # music21 raises a wide variety of exceptions
        raise ConversionError(
            "No se pudo interpretar la partitura. Puede que tenga notación que "
            "todavía no sabemos convertir."
        ) from exc


def _to_musicxml_bytes(stream) -> bytes:
    from music21.musicxml import m21ToXml

    try:
        return m21ToXml.GeneralObjectExporter().parse(stream)
    except Exception as exc:
        raise ConversionError("No se pudo generar el MusicXML.") from exc


def _to_mxl_bytes(musicxml: bytes, inner_name: str = "score.musicxml") -> bytes:
    """Wrap MusicXML in the standard compressed container."""
    container = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        "<container><rootfiles>"
        f'<rootfile full-path="{inner_name}" '
        'media-type="application/vnd.recordare.musicxml+xml"/>'
        "</rootfiles></container>\n"
    ).encode("utf-8")

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        # META-INF/container.xml must be the first entry and stored, per spec.
        archive.writestr("META-INF/container.xml", container)
        archive.writestr(inner_name, musicxml)
    return buffer.getvalue()


def _to_midi_bytes(stream) -> bytes:
    from music21.midi import translate

    try:
        midi_file = translate.streamToMidiFile(stream)
        return midi_file.writestr()
    except Exception as exc:
        raise ConversionError("No se pudo generar el MIDI.") from exc


def export_score(data: str, source_format: str, target_format: str) -> tuple[bytes, str, str]:
    """Convert stored notation into ``target_format``.

    Returns (payload, media type, file extension).
    """
    target = (target_format or "").lower().strip()
    if target in ("xml", "musicxml"):
        target = "musicxml"
    if target in ("mid", "midi"):
        target = "midi"
    if target not in EXPORT_FORMATS:
        raise UnsupportedFormat(
            f"Formato «{target_format}» no soportado. Disponibles: "
            + ", ".join(sorted(EXPORT_FORMATS))
        )

    media_type, extension = EXPORT_FORMATS[target]

    # MEI out of a MEI score, or MusicXML out of a MusicXML score, needs no
    # round trip through music21 -- and a round trip can only lose detail.
    if target == "mei" and source_format == "mei":
        return data.encode("utf-8"), media_type, extension
    if target == "musicxml" and source_format == "musicxml":
        return data.encode("utf-8"), media_type, extension

    if target == "mei" and source_format != "mei":
        raise UnsupportedFormat(
            "No convertimos a MEI desde MusicXML. Guarda la partitura en el editor "
            "y vuelve a exportarla."
        )

    stream = _parse(data, source_format)

    if target == "musicxml":
        return _to_musicxml_bytes(stream), media_type, extension
    if target == "mxl":
        return _to_mxl_bytes(_to_musicxml_bytes(stream)), media_type, extension
    if target == "midi":
        return _to_midi_bytes(stream), media_type, extension

    raise UnsupportedFormat(f"Formato «{target}» no soportado")


def read_uploaded_score(payload: bytes, filename: str) -> tuple[str, str]:
    """Turn an uploaded notation file into (data, format) the editor can open.

    Accepts MusicXML, compressed MusicXML (.mxl), MEI and MIDI. MIDI and .mxl
    are normalised to plain MusicXML, which Verovio loads directly.
    """
    name = (filename or "").lower()

    if name.endswith(".mxl") or payload[:2] == b"PK":
        try:
            with zipfile.ZipFile(io.BytesIO(payload)) as archive:
                inner = _mxl_root_file(archive)
                return archive.read(inner).decode("utf-8", "replace"), "musicxml"
        except ConversionError:
            raise
        except Exception as exc:
            raise ConversionError("El archivo .mxl está dañado.") from exc

    if name.endswith((".mid", ".midi")) or payload[:4] == b"MThd":
        from music21 import converter

        try:
            stream = converter.parse(payload)
        except Exception as exc:
            raise ConversionError("No se pudo leer el archivo MIDI.") from exc
        return _to_musicxml_bytes(stream).decode("utf-8", "replace"), "musicxml"

    text = payload.decode("utf-8", "replace")
    if "<score-partwise" in text or "<score-timewise" in text:
        return text, "musicxml"
    if "<mei" in text or "http://www.music-encoding.org/ns/mei" in text:
        return text, "mei"

    raise ConversionError(
        "Formato no reconocido. Acepta MusicXML (.musicxml, .xml), MusicXML "
        "comprimido (.mxl), MEI (.mei) y MIDI (.mid)."
    )


def _mxl_root_file(archive: zipfile.ZipFile) -> str:
    """Find the score inside a compressed MusicXML container."""
    import xml.etree.ElementTree as ET

    try:
        container = ET.fromstring(archive.read("META-INF/container.xml"))
        rootfile = container.find(".//rootfile")
        if rootfile is not None:
            full_path = rootfile.get("full-path")
            if full_path:
                return full_path
    except KeyError:
        pass
    except ET.ParseError:
        pass

    for name in archive.namelist():
        if name.startswith("META-INF/"):
            continue
        if name.lower().endswith((".musicxml", ".xml")):
            return name
    raise ConversionError("El archivo .mxl no contiene ninguna partitura.")
