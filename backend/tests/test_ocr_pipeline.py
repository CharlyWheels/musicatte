"""Tests for the OCR pipeline: preprocessing, validation, merging, queue.

These are the parts that decide whether "you take the photo and it doesn't get
it right" gets better, so they are tested against synthetic pages whose
correct answer is known.
"""

import cv2
import numpy as np
import pytest

from app.services import music_validation as mv
from app.services import ocr_service as ocr
from app.services import preprocess as pp
from tests.conftest import musicxml, note

FULL = "".join(note(step) for step in "CDEF")


# ─────────────────────── synthetic pages ───────────────────────


def make_page(staves=4, space=16, thickness=2, width=1400):
    """A white page carrying `staves` five-line staves with note heads."""
    height = 120 + staves * (space * 5 + 90)
    page = np.full((height, width), 250, np.uint8)
    y = 90
    for _ in range(staves):
        for line in range(5):
            cv2.line(page, (80, y + line * space), (width - 80, y + line * space), 20, thickness)
        for index, x in enumerate(range(140, width - 140, 90)):
            centre = (x, y + (index % 5) * space)
            cv2.ellipse(page, centre, (int(space * 0.55), int(space * 0.42)), -20, 0, 360, 20, -1)
        y += space * 5 + 90
    return page


def photograph(page, angle=0.0, perspective=False, shadow=True, blur=0):
    """Degrade a clean page the way a phone camera would."""
    image = cv2.cvtColor(page, cv2.COLOR_GRAY2BGR)
    height, width = image.shape[:2]
    if perspective:
        source = np.float32([[0, 0], [width, 0], [width, height], [0, height]])
        target = np.float32(
            [[60, 30], [width - 20, 70], [width - 70, height - 25], [25, height - 60]]
        )
        image = cv2.warpPerspective(
            image, cv2.getPerspectiveTransform(source, target), (width, height),
            borderValue=(255, 255, 255),
        )
    if angle:
        image = cv2.warpAffine(
            image, cv2.getRotationMatrix2D((width / 2, height / 2), angle, 1.0),
            (width, height), borderValue=(255, 255, 255),
        )
    if shadow:
        across = np.linspace(1.0, 0.45, width, dtype=np.float32)[None, :]
        down = np.linspace(1.0, 0.7, height, dtype=np.float32)[:, None]
        image = np.clip(image.astype(np.float32) * (across * down)[..., None], 0, 255).astype(
            np.uint8
        )
    if blur:
        image = cv2.GaussianBlur(image, (blur | 1, blur | 1), 0)
    return cv2.imencode(".png", image)[1].tobytes()


# ─────────────────────── preprocessing ───────────────────────


@pytest.mark.parametrize("angle", [-8.0, -6.0, -2.5, 0.0, 3.5, 8.0])
def test_deskew_leaves_no_residual_tilt(angle):
    """A crooked page was previously sent to the model still crooked."""
    payload = photograph(make_page(), angle=angle)
    variants, _ = pp.build_variants(payload, limit=1)
    straightened = cv2.imdecode(
        np.frombuffer(variants[0].png, np.uint8), cv2.IMREAD_GRAYSCALE
    )
    residual = pp.estimate_skew(pp.binarize(straightened))
    assert abs(residual) <= 0.5, f"{angle}deg page left {residual}deg out of true"


@pytest.mark.parametrize("spacing", [8, 10, 14, 16, 22, 28])
@pytest.mark.parametrize("staves", [1, 2, 4, 6])
def test_staff_count_and_spacing_are_measured_correctly(spacing, staves):
    """Both numbers feed user-facing feedback and piece splitting.

    Counting lines and dividing by five reported zero staves whenever the
    spacing was tight enough for lines to merge after thresholding, and taking
    the spacing from the median gap between detected rows halved it whenever
    contrast enhancement left a halo that split each line in two.
    """
    payload = photograph(make_page(staves=staves, space=spacing, width=1200))
    _, report = pp.build_variants(payload, limit=1)
    assert report.staff_count == staves
    assert report.staff_space is not None
    assert abs(report.staff_space - spacing) <= max(2.5, spacing * 0.25)


def test_staff_count_survives_tilt_and_keystone():
    for extra in ({"angle": 4.0}, {"perspective": True}, {"angle": -6.0, "perspective": True}):
        payload = photograph(make_page(staves=4, space=16, width=1200), **extra)
        _, report = pp.build_variants(payload, limit=1)
        assert report.staff_count == 4, extra


def test_a_blank_page_has_no_staves():
    blank = np.full((800, 1100), 250, np.uint8)
    report = pp.analyze(cv2.imencode(".png", blank)[1].tobytes())
    assert report.staff_count == 0


def test_uniform_scaling_does_not_change_what_the_model_sees():
    """HOMR resizes every input to 1920 wide, so scaling is a no-op for it.

    An earlier version of this pipeline resized images to hit a target staff
    spacing in pixels; the resize inside HOMR undid all of it. The number that
    matters is the spacing after that resize, and it is scale invariant.
    """
    page = make_page(staves=3, space=16)
    small = cv2.resize(page, None, fx=0.5, fy=0.5, interpolation=cv2.INTER_AREA)
    large = cv2.resize(page, None, fx=1.8, fy=1.8, interpolation=cv2.INTER_CUBIC)

    spacings = []
    for variant in (small, large):
        _, report = pp.build_variants(photograph(variant, shadow=False), limit=1)
        assert report.effective_staff_space is not None
        spacings.append(report.effective_staff_space)

    assert abs(spacings[0] - spacings[1]) / max(spacings) < 0.2


def test_a_page_lost_in_a_wide_frame_is_cropped_to_the_music():
    """Cropping is the only preprocessing step that changes effective staff size."""
    page = make_page(staves=2, space=14, width=900)
    framed = cv2.copyMakeBorder(page, 300, 300, 700, 700, cv2.BORDER_CONSTANT, value=245)

    _, framed_report = pp.build_variants(photograph(framed, shadow=False), limit=1)
    assert framed_report.cropped, "the page was not cropped out of the surrounding frame"
    assert framed_report.effective_staff_space is not None

    _, tight_report = pp.build_variants(photograph(page, shadow=False), limit=1)
    assert tight_report.effective_staff_space is not None
    # After cropping, a page lost in a wide frame looks like a tightly framed
    # one to the model.
    ratio = framed_report.effective_staff_space / tight_report.effective_staff_space
    assert 0.6 < ratio < 1.6, ratio


def test_cropping_is_refused_when_it_would_cut_the_music():
    """A crop that keeps almost nothing is a detection failure, not a crop."""
    noise = np.random.default_rng(1).integers(200, 255, (600, 900), dtype=np.uint8)
    cropped, did_crop = pp.crop_to_content(noise, pp.binarize(noise))
    assert not did_crop or cropped.shape[0] * cropped.shape[1] >= 0.06 * noise.size


def test_blurry_photo_is_reported_as_such():
    payload = photograph(make_page(), blur=15)
    report = pp.analyze(payload)
    assert "desenfocada" in report.problems
    assert report.blur_score < pp.BLUR_THRESHOLD


def test_a_photo_with_no_music_in_it_is_recognised_as_such():
    noise = np.random.default_rng(0).integers(90, 160, (900, 1200), dtype=np.uint8)
    report = pp.analyze(cv2.imencode(".png", noise)[1].tobytes())
    assert report.staff_count == 0
    assert not report.looks_like_sheet_music


def test_exif_rotation_is_applied():
    """A portrait photo stored landscape must not reach the model sideways."""
    from io import BytesIO

    from PIL import Image

    page = make_page(staves=2)
    buffer = BytesIO()
    image = Image.fromarray(page)
    # Orientation 6 = rotate 90 degrees clockwise on display.
    exif = image.getexif()
    exif[274] = 6
    image.save(buffer, format="JPEG", exif=exif)

    decoded = pp.decode(buffer.getvalue())
    assert decoded.shape[0] > decoded.shape[1], "EXIF orientation was ignored"


def test_variants_are_distinct_and_bounded():
    payload = photograph(make_page())
    variants, _ = pp.build_variants(payload, limit=3)
    assert len(variants) == 3
    assert len({v.name for v in variants}) == 3
    assert all(v.png[:8] == b"\x89PNG\r\n\x1a\n" for v in variants)


def test_decode_rejects_garbage():
    with pytest.raises(ValueError):
        pp.decode(b"not an image")


# ─────────────────────── musical validation ───────────────────────


def test_a_correct_measure_produces_no_warnings():
    assert mv.validate(musicxml([FULL])) == []
    assert mv.rhythmic_consistency(musicxml([FULL])) == 1.0


def test_a_short_measure_is_flagged_with_its_number():
    short = note("C") * 3 + note("D", duration=2, note_type="eighth")
    warnings = mv.validate(musicxml([FULL, short, FULL]))
    assert len(warnings) == 1
    assert warnings[0]["measure"] == 2
    assert warnings[0]["severity"] == "error"
    assert "3.5 de 4" in warnings[0]["message"]


def test_chords_do_not_count_as_extra_beats():
    chord = (
        note("C", duration=16, note_type="whole")
        + note("E", duration=16, note_type="whole", chord=True)
        + note("G", duration=16, note_type="whole", chord=True)
    )
    assert mv.rhythmic_consistency(musicxml([chord])) == 1.0


def test_a_grand_staff_measure_is_not_counted_twice():
    grand = (
        note("C", 5, 16, "whole", staff=1)
        + "<backup><duration>16</duration></backup>"
        + note("C", 3, 16, "whole", staff=2)
    )
    assert mv.rhythmic_consistency(musicxml([grand], staves=2)) == 1.0


@pytest.mark.parametrize(
    "beats,beat_type,content",
    [
        (3, 4, note("C") * 3),
        (6, 8, note("C", duration=2, note_type="eighth") * 6),
        (2, 2, note("C", duration=8, note_type="half") * 2),
        (5, 4, note("C") * 5),
    ],
)
def test_other_time_signatures_add_up(beats, beat_type, content):
    score = musicxml([content], beats=beats, beat_type=beat_type)
    assert mv.rhythmic_consistency(score) == 1.0


def test_empty_measures_are_flagged():
    warnings = mv.validate(musicxml([FULL, "", FULL]))
    assert any(w["kind"] == "empty_measure" and w["measure"] == 2 for w in warnings)


def test_out_of_range_notes_are_flagged_for_the_instrument():
    high = note("C", 8) + note("C") * 3
    warnings = mv.validate(musicxml([high]), instrument="cello")
    assert any(w["kind"] == "out_of_range" for w in warnings)
    # The same note is unremarkable on a piano.
    assert not any(
        w["kind"] == "out_of_range" for w in mv.validate(musicxml([high]), instrument="piano")
    )


def test_large_leaps_are_flagged_as_possible_octave_errors():
    leap = note("C", 3) + note("C", 7) + note("C") * 2
    warnings = mv.validate(musicxml([leap]))
    assert any(w["kind"] == "large_leap" for w in warnings)


def test_broken_xml_is_reported_not_raised():
    warnings = mv.validate("<not-xml")
    assert warnings and warnings[0]["kind"] == "xml"
    assert mv.rhythmic_consistency("<not-xml") == 0.0


def test_summarise_counts_measures_and_severities():
    short = note("C") * 3
    summary = mv.summarise(musicxml([FULL, short]))
    assert summary["measures"] == 2
    assert summary["measures_ok"] == 1
    assert summary["consistency"] == 0.5
    assert summary["counts"]["error"] == 1


# ─────────────────────── merging and splitting ───────────────────────


def test_merging_pages_preserves_a_key_and_time_change():
    """The previous merge deleted each page's first attributes block wholesale,
    silently discarding real key and time changes at page breaks."""
    page1 = musicxml([FULL, FULL])
    page2 = musicxml([note("G") * 3], fifths=2, beats=3, beat_type=4)
    merged = ocr.merge_pages([page1, page2])

    import xml.etree.ElementTree as ET

    root = ET.fromstring(merged)
    measures = root.findall("part/measure")
    assert [m.get("number") for m in measures] == ["1", "2", "3"]
    third = measures[2].find("attributes")
    assert third is not None, "the key change at the page break was dropped"
    assert third.findtext("key/fifths") == "2"
    assert third.findtext("time/beats") == "3"
    # Redundant repetitions are still pruned.
    assert third.find("clef") is None
    assert mv.rhythmic_consistency(merged) == 1.0


def test_merging_pages_with_different_divisions_keeps_the_rhythm():
    """Pages recognised independently can each choose their own divisions."""
    page1 = musicxml([FULL], divisions=4)
    page2 = musicxml(
        ["".join(note(s, duration=24) for s in "CDEF")], divisions=24
    )
    merged = ocr.merge_pages([page1, page2])
    assert mv.rhythmic_consistency(merged) == 1.0


def test_merge_of_a_single_page_is_just_sanitised():
    merged = ocr.merge_pages([musicxml([FULL])])
    assert "<score-partwise" in merged
    assert mv.rhythmic_consistency(merged) == 1.0


def _page(number, staves=1, title="", ends=False):
    return ocr.PageResult(number, musicxml([FULL]), "normalizada", 1.0, staves, title, ends)


def test_a_final_barline_starts_a_new_piece():
    pages = [_page(1), _page(2, ends=True), _page(3), _page(4)]
    assert ocr.suggest_boundaries(pages) == [1, 3]


def test_a_change_in_staff_count_starts_a_new_piece():
    pages = [_page(1, staves=2), _page(2, staves=2), _page(3, staves=1)]
    assert ocr.suggest_boundaries(pages) == [1, 3]


def test_a_new_title_starts_a_new_piece():
    assert ocr.suggest_boundaries([_page(1), _page(2, title="Minueto")]) == [1, 2]


def test_generic_titles_do_not_split():
    pages = [_page(1, title="Untitled"), _page(2, title="Untitled")]
    assert ocr.suggest_boundaries(pages) == [1]


def test_no_signals_means_one_piece():
    assert ocr.suggest_boundaries([_page(1), _page(2), _page(3)]) == [1]


def test_build_pieces_groups_pages_at_the_boundaries():
    pages = [_page(1), _page(2), _page(3), _page(4)]
    pieces = ocr.build_pieces(pages, [1, 3])
    assert len(pieces) == 2
    assert pieces[0]["pages"] == [1, 2]
    assert pieces[1]["pages"] == [3, 4]
    assert pieces[0]["consistency"] == 1.0
    assert pieces[0]["measures"] == 2


def test_build_pieces_always_starts_at_the_first_page():
    pieces = ocr.build_pieces([_page(1), _page(2)], [2])
    assert [piece["pages"] for piece in pieces] == [[1], [2]]


# ─────────────────────── the durable queue ───────────────────────


def test_a_job_can_be_claimed_exactly_once():
    from app import jobqueue
    from app.database import SessionLocal
    from app.models.ocr_job import OcrJob
    from app.models.user import User
    from app.services.auth import hash_password

    db = SessionLocal()
    try:
        owner = User(email=f"queue-{id(db)}@example.com", password_hash=hash_password("x" * 8))
        db.add(owner)
        db.commit()
        job = OcrJob(user_id=owner.id, status="queued", image_path="uploads/none.png")
        db.add(job)
        db.commit()
        job_id = job.id

        first = jobqueue.claim_next(db)
        assert first is not None and first.id == job_id
        assert first.status == "processing"
        assert first.attempts == 1

        # No second worker may take the same job.
        assert all(
            claimed is None or claimed.id != job_id
            for claimed in [jobqueue.claim_next(db)]
        )
    finally:
        db.close()


def test_an_abandoned_job_is_requeued_not_left_hanging():
    """A restart mid-recognition used to leave the row in `processing` for ever."""
    from datetime import datetime, timedelta, timezone

    from app import jobqueue
    from app.database import SessionLocal
    from app.models.ocr_job import OcrJob
    from app.models.user import User
    from app.services.auth import hash_password

    db = SessionLocal()
    try:
        owner = User(email=f"stale-{id(db)}@example.com", password_hash=hash_password("x" * 8))
        db.add(owner)
        db.commit()
        job = OcrJob(
            user_id=owner.id,
            status="processing",
            image_path="uploads/none.png",
            attempts=1,
            claimed_at=datetime.now(timezone.utc) - timedelta(hours=2),
        )
        db.add(job)
        db.commit()
        job_id = job.id

        assert jobqueue.requeue_stale(db) >= 1
        db.expire_all()
        assert db.get(OcrJob, job_id).status == "queued"
    finally:
        db.close()


def test_a_job_that_keeps_failing_is_given_up_on():
    from datetime import datetime, timedelta, timezone

    from app import jobqueue
    from app.database import SessionLocal
    from app.models.ocr_job import OcrJob
    from app.models.user import User
    from app.services.auth import hash_password

    db = SessionLocal()
    try:
        owner = User(email=f"doomed-{id(db)}@example.com", password_hash=hash_password("x" * 8))
        db.add(owner)
        db.commit()
        job = OcrJob(
            user_id=owner.id,
            status="processing",
            image_path="uploads/none.png",
            attempts=jobqueue.MAX_ATTEMPTS,
            claimed_at=datetime.now(timezone.utc) - timedelta(hours=2),
        )
        db.add(job)
        db.commit()
        job_id = job.id

        jobqueue.requeue_stale(db)
        db.expire_all()
        refreshed = db.get(OcrJob, job_id)
        assert refreshed.status == "failed"
        assert "varias veces" in refreshed.error
    finally:
        db.close()


def test_a_missing_upload_fails_the_job_with_a_clear_message():
    from app.database import SessionLocal
    from app.models.ocr_job import OcrJob
    from app.models.user import User
    from app.services.auth import hash_password

    db = SessionLocal()
    try:
        owner = User(email=f"nofile-{id(db)}@example.com", password_hash=hash_password("x" * 8))
        db.add(owner)
        db.commit()
        job = OcrJob(user_id=owner.id, status="queued", image_path="uploads/gone.png")
        db.add(job)
        db.commit()

        ocr.process_ocr_job(db, job.id)
        db.expire_all()
        refreshed = db.get(OcrJob, job.id)
        assert refreshed.status == "failed"
        assert "ya no está disponible" in refreshed.error
    finally:
        db.close()


# ─────────────────────── binarisation keeps note heads solid ───────────────────────


def _head_positions(staves=3, space=16, width=1500):
    """Where make_page draws its note heads, so their ink can be measured."""
    positions = []
    y = 90
    for _ in range(staves):
        for index, x in enumerate(range(140, width - 140, 90)):
            positions.append((x, y + (index % 5) * space))
        y += space * 5 + 90
    return positions


def test_note_heads_stay_solid_after_binarisation():
    """A filled note head must not come out hollow.

    An adaptive threshold whose window is about the size of a note head
    measures the middle of the head against a mean the head itself dominates,
    so the interior is dropped and the head becomes a ring. Every quarter note
    then reads as a half note, and nothing about the result looks wrong until
    you look at the image.
    """
    space = 16
    page = make_page(staves=3, space=space, width=1500)
    binary = pp.binarize(pp.flatten_illumination(page))

    radius = max(3, int(space * 0.35))
    coverages = []
    for x, y in _head_positions(staves=3, space=space, width=1500):
        patch = binary[y - radius : y + radius + 1, x - radius : x + radius + 1]
        if patch.size:
            coverages.append(float((patch > 0).mean()))

    assert coverages
    assert min(coverages) > 0.75, f"hollow note heads: min coverage {min(coverages):.2f}"


def test_staff_lines_stay_thin_after_binarisation():
    """The same threshold must not thicken the staff into a block."""
    page = make_page(staves=3, space=16, width=1500)
    binary = pp.binarize(pp.flatten_illumination(page))
    ink = float((binary > 0).mean())
    assert 0.005 < ink < 0.25, f"implausible ink coverage {ink:.3f}"
    assert pp.analyse_staves(binary)[0] == 3


def test_binarisation_survives_a_photographed_page():
    """End to end on a page with keystone, tilt and a lighting gradient."""
    payload = photograph(make_page(staves=3, space=16, width=1500), angle=4.0, perspective=True)
    variants, report = pp.build_variants(payload, limit=2)
    assert report.staff_count == 3
    assert len(variants) == 2

    binarised = next(variant for variant in variants if variant.name == "binarizada")
    image = cv2.imdecode(np.frombuffer(binarised.png, np.uint8), cv2.IMREAD_GRAYSCALE)
    # The variant is ink-on-white, so invert before measuring.
    ink = float((image < 128).mean())
    assert 0.005 < ink < 0.25, f"implausible ink coverage {ink:.3f}"


def test_a_nearly_blank_page_does_not_become_all_ink():
    """Otsu splits noise on a blank page; the fallback has to catch that."""
    blank = np.full((700, 1000), 248, np.uint8)
    blank[300:302, 100:900] = 30  # one lonely rule
    binary = pp.binarize(blank)
    assert float((binary > 0).mean()) < 0.4
