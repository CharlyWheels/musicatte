"""Check a recognised score as music, not just as XML.

The previous sanitiser fixed duplicate ``<attributes>`` blocks and stripped
empty ``<notations/>`` elements. All correct, and all irrelevant to whether the
recognition was right: nobody checked that a measure's notes add up to what
its time signature promises, which is the single clearest sign that OMR
misread something.

Two things come out of this module:

* :func:`validate` -- warnings tied to measure numbers, so the editor can send
  the user straight to the bars that need checking. Recognition will never be
  perfect; what matters is that its mistakes are visible and quick to fix.
* :func:`rhythmic_consistency` -- one number for how well a document adds up,
  used to pick the best of several recognition passes.
"""

from __future__ import annotations

import logging
import xml.etree.ElementTree as ET
from dataclasses import asdict, dataclass
from fractions import Fraction

logger = logging.getLogger(__name__)

_STEP_SEMITONES = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}

# Comfortable written ranges as MIDI note numbers. Anything outside is very
# likely a misread octave or a spurious ledger line, which is exactly the kind
# of error that is invisible on screen but obvious when you play it back.
INSTRUMENT_RANGES: dict[str, tuple[int, int]] = {
    "piano": (21, 108),
    "guitar": (40, 88),
    "violin": (55, 103),
    "cello": (36, 76),
    "flute": (60, 96),
    "clarinet": (50, 94),
    "trumpet": (55, 89),
    "saxophone": (49, 89),
    "voice": (36, 84),
    "drums": (35, 81),
}
DEFAULT_RANGE = (21, 108)

# An interval this wide between adjacent notes in one voice is almost always a
# misread octave rather than a real leap.
LARGE_LEAP_SEMITONES = 20

SEVERITY_ORDER = {"error": 0, "warning": 1, "info": 2}


@dataclass
class Warning_:
    measure: int | None
    kind: str
    severity: str
    message: str

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class MeasureRhythm:
    number: int
    actual: Fraction
    expected: Fraction

    @property
    def ok(self) -> bool:
        return self.actual == self.expected

    @property
    def empty(self) -> bool:
        return self.actual == 0


def _text(element: ET.Element | None, default: str = "") -> str:
    if element is None or element.text is None:
        return default
    return element.text.strip()


def _int(element: ET.Element | None, default: int = 0) -> int:
    try:
        return int(_text(element, str(default)))
    except ValueError:
        return default


def _midi_number(pitch: ET.Element) -> int | None:
    step = _text(pitch.find("step")).upper()
    if step not in _STEP_SEMITONES:
        return None
    octave = _int(pitch.find("octave"), 4)
    alter = 0
    alter_el = pitch.find("alter")
    if alter_el is not None:
        try:
            alter = int(float(_text(alter_el, "0")))
        except ValueError:
            alter = 0
    return (octave + 1) * 12 + _STEP_SEMITONES[step] + alter


def _measure_rhythm(measure: ET.Element, divisions: int, beats: int, beat_type: int) -> MeasureRhythm:
    """How long the measure actually is, versus how long it should be.

    Position is tracked with a cursor rather than by summing durations: that is
    the only way to get ``<backup>``, ``<forward>``, chords and several voices
    or staves in one measure right. Summing note durations counts a two-staff
    piano bar twice and a chord once per note.
    """
    cursor = 0
    furthest = 0
    for child in measure:
        if child.tag == "note":
            if child.find("grace") is not None:
                continue
            duration = _int(child.find("duration"), 0)
            if child.find("chord") is not None:
                # Sounds with the previous note; it does not advance time.
                furthest = max(furthest, cursor)
                continue
            cursor += duration
            furthest = max(furthest, cursor)
        elif child.tag == "backup":
            cursor = max(0, cursor - _int(child.find("duration"), 0))
        elif child.tag == "forward":
            cursor += _int(child.find("duration"), 0)
            furthest = max(furthest, cursor)

    expected = Fraction(divisions * 4 * beats, beat_type) if beat_type else Fraction(0)
    try:
        number = int(measure.get("number", "0"))
    except ValueError:
        number = 0
    return MeasureRhythm(number=number, actual=Fraction(furthest), expected=expected)


def _fraction_to_beats(value: Fraction, divisions: int, beat_type: int) -> str:
    """Render a duration in beats, for a message a musician can act on."""
    if divisions <= 0 or beat_type <= 0:
        return str(value)
    beats = value * Fraction(beat_type, 4) / divisions
    if beats.denominator == 1:
        return str(beats.numerator)
    return f"{float(beats):.2f}".rstrip("0").rstrip(".")


def analyse(musicxml: str, instrument: str = "piano") -> tuple[list[Warning_], list[MeasureRhythm]]:
    """Walk a MusicXML document, collecting warnings and per-measure rhythm."""
    warnings: list[Warning_] = []
    rhythms: list[MeasureRhythm] = []

    try:
        root = ET.fromstring(musicxml)
    except ET.ParseError as exc:
        return [Warning_(None, "xml", "error", f"El archivo no es XML válido: {exc}")], []

    parts = root.findall("part")
    if not parts:
        return [Warning_(None, "empty", "error", "La partitura no contiene ninguna parte.")], []

    low, high = INSTRUMENT_RANGES.get((instrument or "").lower(), DEFAULT_RANGE)

    for part in parts:
        divisions = 1
        beats, beat_type = 4, 4
        previous_pitch: dict[str, int] = {}

        for measure in part.findall("measure"):
            attributes = measure.find("attributes")
            if attributes is not None:
                divisions = _int(attributes.find("divisions"), divisions) or divisions
                time_el = attributes.find("time")
                if time_el is not None:
                    beats = _int(time_el.find("beats"), beats) or beats
                    beat_type = _int(time_el.find("beat-type"), beat_type) or beat_type

            rhythm = _measure_rhythm(measure, divisions, beats, beat_type)
            rhythms.append(rhythm)

            if rhythm.empty:
                warnings.append(
                    Warning_(
                        rhythm.number,
                        "empty_measure",
                        "warning",
                        f"Compás {rhythm.number}: vacío, no se reconoció ninguna nota.",
                    )
                )
            elif not rhythm.ok and rhythm.expected:
                actual = _fraction_to_beats(rhythm.actual, divisions, beat_type)
                expected = _fraction_to_beats(rhythm.expected, divisions, beat_type)
                verb = "le faltan" if rhythm.actual < rhythm.expected else "le sobran"
                warnings.append(
                    Warning_(
                        rhythm.number,
                        "measure_duration",
                        "error",
                        f"Compás {rhythm.number}: {actual} de {expected} tiempos "
                        f"({verb} tiempos). Revisa las duraciones.",
                    )
                )

            for note in measure.findall("note"):
                pitch = note.find("pitch")
                if pitch is None:
                    continue
                midi = _midi_number(pitch)
                if midi is None:
                    continue

                if midi < low or midi > high:
                    warnings.append(
                        Warning_(
                            rhythm.number,
                            "out_of_range",
                            "warning",
                            f"Compás {rhythm.number}: {_note_name(midi)} queda fuera del "
                            f"registro de {instrument}. Puede ser una octava mal leída.",
                        )
                    )

                voice = _text(note.find("voice"), "1")
                if note.find("chord") is None:
                    last = previous_pitch.get(voice)
                    if last is not None and abs(midi - last) >= LARGE_LEAP_SEMITONES:
                        warnings.append(
                            Warning_(
                                rhythm.number,
                                "large_leap",
                                "info",
                                f"Compás {rhythm.number}: salto de "
                                f"{abs(midi - last)} semitonos ({_note_name(last)} → "
                                f"{_note_name(midi)}). Comprueba la octava.",
                            )
                        )
                    previous_pitch[voice] = midi

    warnings.sort(key=lambda w: (SEVERITY_ORDER.get(w.severity, 9), w.measure or 0))
    return warnings, rhythms


def _note_name(midi: int) -> str:
    names = ["Do", "Do♯", "Re", "Re♯", "Mi", "Fa", "Fa♯", "Sol", "Sol♯", "La", "La♯", "Si"]
    return f"{names[midi % 12]}{midi // 12 - 1}"


def validate(musicxml: str, instrument: str = "piano", limit: int = 60) -> list[dict]:
    """Warnings for a recognised score, most serious first."""
    warnings, _ = analyse(musicxml, instrument)
    return [w.to_dict() for w in warnings[:limit]]


def rhythmic_consistency(musicxml: str) -> float:
    """Fraction of measures whose durations add up, in ``[0, 1]``.

    This is the score used to choose between recognition passes. It needs no
    ground truth, which is what makes it usable in production: a pass that
    produces measures that add up read the rhythm correctly, and one that
    produces three-and-a-half-beat bars in 4/4 did not.
    """
    try:
        _, rhythms = analyse(musicxml)
    except Exception:
        logger.exception("Could not score rhythmic consistency")
        return 0.0
    if not rhythms:
        return 0.0
    good = sum(1 for rhythm in rhythms if rhythm.ok and not rhythm.empty)
    return good / len(rhythms)


def summarise(musicxml: str, instrument: str = "piano") -> dict:
    """Compact report for the review screen."""
    warnings, rhythms = analyse(musicxml, instrument)
    total = len(rhythms)
    good = sum(1 for r in rhythms if r.ok and not r.empty)
    return {
        "measures": total,
        "measures_ok": good,
        "consistency": round(good / total, 3) if total else 0.0,
        "warnings": [w.to_dict() for w in warnings[:60]],
        "counts": {
            "error": sum(1 for w in warnings if w.severity == "error"),
            "warning": sum(1 for w in warnings if w.severity == "warning"),
            "info": sum(1 for w in warnings if w.severity == "info"),
        },
    }
