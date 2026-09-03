"""Turn a phone photo into something an OMR model can actually read.

HOMR is trained on flat, evenly lit scans. A photo taken by hand arrives with
unapplied EXIF rotation, keystone distortion, the curve of the book's spine, a
shadow from the hand holding the phone, low contrast and an arbitrary
resolution. Every one of those degrades recognition on its own; together they
make the result useless. This module removes them before the image is ever
sent to the model.

The pipeline is deliberately measurable: :func:`analyze` reports what it found
(blur, skew, staff spacing, how many staves) so the caller can warn the user
about a photo that is not worth processing, and :func:`build_variants`
produces several preprocessed candidates so the caller can run more than one
and keep whichever recognises best.
"""

from __future__ import annotations

import io
import logging
import math
from dataclasses import dataclass, field

import cv2
import numpy as np
from PIL import Image, ImageOps

logger = logging.getLogger(__name__)

# HOMR resizes every input to exactly this width before it looks at anything
# (homr/resize.py). Two consequences drive the design of this module:
#
#   * Scaling the image uniformly is pointless. It multiplies the staff spacing
#     and the page width by the same factor, so the spacing *after* HOMR's
#     resize is unchanged. An earlier version of this pipeline resized to hit a
#     target staff spacing; HOMR silently undid all of it.
#   * What does change the effective staff size is *cropping*. A photo where
#     the page fills 60% of the frame yields staves 40% smaller than they
#     should be once the frame is stretched to 1920. So cropping to the music
#     is the real lever, and HOMR's own autocrop only fires when the page
#     border sits well inside the frame.
HOMR_TARGET_WIDTH = 1920

# Staff space, measured as it will be once the page is 1920 wide, that OMR
# models are happiest with.
ACCEPTABLE_STAFF_SPACE = (9.0, 26.0)
MAX_DIMENSION = 4200  # guards against 50 MP phone images
MIN_USEFUL_WIDTH = 900

# Below this, the photo is too soft for the note heads to survive binarisation.
BLUR_THRESHOLD = 55.0


@dataclass
class ImageReport:
    """What the preprocessor could tell about the photo."""

    width: int
    height: int
    blur_score: float
    skew_degrees: float
    staff_space: float | None
    staff_line_thickness: float | None
    staff_count: int
    perspective_corrected: bool
    cropped: bool = False
    # Staff spacing as the model will see it, after its resize to 1920 wide.
    # The raw pixel figure above says nothing on its own.
    effective_staff_space: float | None = None
    problems: list[str] = field(default_factory=list)

    @property
    def looks_like_sheet_music(self) -> bool:
        return self.staff_count >= 1

    def to_dict(self) -> dict:
        return {
            "width": self.width,
            "height": self.height,
            "blur_score": round(self.blur_score, 1),
            "skew_degrees": round(self.skew_degrees, 2),
            "staff_space": round(self.staff_space, 1) if self.staff_space else None,
            "effective_staff_space": (
                round(self.effective_staff_space, 1) if self.effective_staff_space else None
            ),
            "staff_count": self.staff_count,
            "perspective_corrected": self.perspective_corrected,
            "cropped": self.cropped,
            "problems": list(self.problems),
        }


@dataclass
class Variant:
    """One preprocessed candidate image, ready to send to the model."""

    name: str
    label: str
    png: bytes


# ──────────────────────────── decoding ────────────────────────────


def decode(payload: bytes) -> np.ndarray:
    """Decode to BGR, honouring EXIF orientation.

    Skipping EXIF is not a subtle quality issue: a portrait photo stored
    landscape with a rotation flag means the model is handed the page on its
    side, and OMR on a sideways page returns nothing usable.
    """
    try:
        with Image.open(io.BytesIO(payload)) as img:
            img = ImageOps.exif_transpose(img)
            img = img.convert("RGB")
            array = np.array(img)
    except Exception as exc:
        raise ValueError("No se pudo leer la imagen") from exc

    bgr = cv2.cvtColor(array, cv2.COLOR_RGB2BGR)
    return _limit_size(bgr)


def _limit_size(image: np.ndarray) -> np.ndarray:
    height, width = image.shape[:2]
    longest = max(height, width)
    if longest <= MAX_DIMENSION:
        return image
    scale = MAX_DIMENSION / longest
    return cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)


def encode_png(image: np.ndarray) -> bytes:
    ok, buffer = cv2.imencode(".png", image)
    if not ok:
        raise ValueError("No se pudo codificar la imagen")
    return buffer.tobytes()


# ──────────────────────── illumination & contrast ────────────────────────


def flatten_illumination(gray: np.ndarray) -> np.ndarray:
    """Remove the shadow gradient by dividing out the local background.

    A large-radius blur is a good estimate of "the paper", so dividing the
    image by it leaves the ink and discards the lighting. This is what makes a
    photo taken under a desk lamp binarise like a scan.
    """
    radius = max(15, int(min(gray.shape[:2]) * 0.03) | 1)
    background = cv2.GaussianBlur(gray, (radius, radius), 0)
    background = np.maximum(background, 1)
    flattened = (gray.astype(np.float32) / background.astype(np.float32)) * 210.0
    flattened = np.clip(flattened, 0, 255).astype(np.uint8)
    return cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(flattened)


def binarize(gray: np.ndarray) -> np.ndarray:
    """Threshold to ink=255 on a black background.

    Otsu, not an adaptive threshold. Adaptive thresholding compares each pixel
    against its own neighbourhood, and a window near the size of a note head
    means the middle of a filled head is measured against a mean the head
    itself dominates -- so the interior falls below the threshold and the head
    comes out as a hollow ring. Every quarter note then looks like a half note
    to the recogniser, which is a large and completely silent accuracy loss.

    Otsu is safe here precisely because :func:`flatten_illumination` has
    already removed the lighting gradient that adaptive thresholding exists to
    cope with. Adaptive remains the fallback for an image where a single
    threshold cannot separate ink from paper at all.
    """
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    ink = float((binary > 0).mean())
    # A sane page is a few percent ink. Far outside that, Otsu has split noise
    # rather than content -- a nearly blank page, or one with no real contrast.
    if 0.001 < ink < 0.4:
        return binary

    # The fallback window is deliberately far wider than a note head.
    block = max(31, int(min(gray.shape[:2]) * 0.05) | 1)
    return cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, block, 12
    )


# ──────────────────────────── staff metrics ────────────────────────────


def _run_lengths(mask: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Run values and lengths along a 1-D boolean array."""
    if mask.size == 0:
        return np.array([], dtype=bool), np.array([], dtype=int)
    change = np.flatnonzero(np.diff(mask.astype(np.int8))) + 1
    starts = np.concatenate(([0], change))
    ends = np.concatenate((change, [mask.size]))
    return mask[starts], ends - starts


def estimate_staff_metrics(binary: np.ndarray) -> tuple[float | None, float | None]:
    """Estimate (staff space, staff line thickness) in pixels.

    The classic OMR trick: down each column the most common run of ink is a
    staff line's thickness and the most common run of paper is the gap between
    two lines. It needs no line detection and copes with handwriting.
    """
    height, width = binary.shape[:2]
    if height < 40 or width < 40:
        return None, None

    step = max(1, width // 250)
    columns = binary[:, ::step] > 0

    ink_counts = np.zeros(height + 1, dtype=np.int64)
    gap_counts = np.zeros(height + 1, dtype=np.int64)

    for index in range(columns.shape[1]):
        values, lengths = _run_lengths(columns[:, index])
        if values.size == 0:
            continue
        # Runs touching the border are truncated, so they are not evidence.
        interior = slice(1, -1) if values.size > 2 else slice(0, 0)
        for value, length in zip(values[interior], lengths[interior]):
            if length > height // 4:
                continue
            if value:
                ink_counts[length] += 1
            else:
                gap_counts[length] += 1

    thickness = _weighted_mode(ink_counts, low=1, high=max(2, height // 60))
    space = _weighted_mode(gap_counts, low=3, high=max(6, height // 15))
    return space, thickness


def _weighted_mode(counts: np.ndarray, low: int, high: int) -> float | None:
    window = counts[low : high + 1]
    if window.size == 0 or window.sum() == 0:
        return None
    peak = int(np.argmax(window))
    # Interpolate against the neighbours so the estimate is not quantised to
    # whole pixels; staff spacing is rarely an integer in a photo.
    lo = max(0, peak - 1)
    hi = min(window.size - 1, peak + 1)
    weights = window[lo : hi + 1].astype(np.float64)
    positions = np.arange(lo, hi + 1) + low
    return float((weights * positions).sum() / weights.sum())


def staff_line_mask(binary: np.ndarray) -> np.ndarray:
    """Keep only long horizontal structures -- i.e. the staff lines."""
    width = binary.shape[1]
    kernel_width = max(15, width // 25)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (kernel_width, 1))
    return cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)


def estimate_skew(binary: np.ndarray, limit: float = 10.0, step: float = 0.2) -> float:
    """Dominant rotation in degrees, from the staff lines themselves.

    Staff lines are the longest straight features on the page, which makes
    them a far more reliable skew signal than text baselines or page edges.

    The angle is found by maximising the variance of the horizontal projection
    profile: when the page is straight, every staff line contributes all its
    ink to a single row, so the profile has five tall spikes per staff and its
    variance peaks. A Hough median, which is the obvious alternative, averages
    over lines that perspective has left non-parallel and lands short of the
    real angle.

    The search runs on a downscaled copy, so trying a hundred angles costs
    less than a single full-resolution rotation.

    Note that no horizontal masking happens first. Isolating the staff lines
    with a wide horizontal kernel looks like the obvious preparation, but that
    kernel is exactly what a tilted line fails to survive: on a page rotated
    six degrees it erases the very lines being measured, the estimate comes
    back as zero and the page is left crooked. Staff lines span the full width,
    so they dominate the projection profile without any help.
    """
    if binary.max() == 0:
        return 0.0

    lines_only = binary
    width = lines_only.shape[1]
    scale = min(1.0, 700.0 / max(width, 1))
    if scale < 1.0:
        lines_only = cv2.resize(
            lines_only, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA
        )

    best_angle = 0.0
    best_score = -1.0
    angle = -limit
    while angle <= limit + 1e-9:
        rotated = (
            lines_only
            if abs(angle) < 1e-9
            else cv2.warpAffine(
                lines_only,
                cv2.getRotationMatrix2D(
                    (lines_only.shape[1] / 2, lines_only.shape[0] / 2), angle, 1.0
                ),
                (lines_only.shape[1], lines_only.shape[0]),
                flags=cv2.INTER_LINEAR,
                borderValue=0,
            )
        )
        profile = rotated.sum(axis=1, dtype=np.float64)
        # Squared differences between adjacent rows: high when ink is
        # concentrated into sharp lines, low when it is smeared across rows.
        score = float(np.square(np.diff(profile)).sum())
        if score > best_score:
            best_score = score
            best_angle = angle
        angle += step

    # best_angle is the rotation that straightened the page during the search,
    # expressed in cv2's own convention, so it is exactly what the caller
    # should apply. Negating it here rotated pages further out of true and made
    # each refinement pass worse than the last.
    return float(best_angle)


def deskew(gray: np.ndarray, max_passes: int = 3) -> tuple[np.ndarray, float]:
    """Straighten the page, refining across passes.

    One pass is not always enough: on a photo that also has keystone
    distortion the first estimate lands short, and re-measuring on the
    partially straightened image converges on the rest.
    """
    total = 0.0
    current = gray
    for _ in range(max_passes):
        angle = estimate_skew(binarize(current))
        if abs(angle) < 0.25:
            break
        current = rotate(current, angle)
        total += angle
    return current, total


def _dominant_period(profile: np.ndarray, low: int, high: int) -> float | None:
    """The repeat distance of a periodic row profile, in pixels.

    Staff lines are evenly spaced, so the autocorrelation of the horizontal
    projection peaks at the staff spacing. Reading the spacing this way is
    unaffected by a line splitting into several detected rows.

    The window must be kept tight around a prior estimate. Searched broadly,
    the autocorrelation of a page of several staves peaks at the distance
    *between* staves instead, which is five to ten times too large.
    """
    if profile.size < 8 or high <= low:
        return None
    centred = profile.astype(np.float64) - profile.mean()
    if not np.any(centred):
        return None
    correlation = np.correlate(centred, centred, mode="full")[profile.size - 1 :]
    high = min(high, correlation.size - 2)
    if high <= low:
        return None
    window = correlation[low : high + 1]
    if window.size == 0 or window.max() <= 0:
        return None

    peak = int(np.argmax(window)) + low
    # Parabolic refinement: staff spacing in a photo is rarely a whole number.
    if 0 < peak < correlation.size - 1:
        before, at, after = correlation[peak - 1], correlation[peak], correlation[peak + 1]
        denominator = before - 2 * at + after
        if denominator != 0:
            peak += float(np.clip(0.5 * (before - after) / denominator, -0.5, 0.5))
    return float(peak) if peak > 0 else None


def _line_rows(profile: np.ndarray) -> list[tuple[int, int]]:
    """Row ranges that carry long horizontal ink."""
    if profile.max() <= 0:
        return []
    rows = profile > 0.30 * profile.max()
    values, lengths = _run_lengths(rows)
    ranges: list[tuple[int, int]] = []
    offset = 0
    for value, length in zip(values, lengths):
        if value:
            ranges.append((offset, offset + length))
        offset += length
    return ranges


def analyse_staves(binary: np.ndarray) -> tuple[int, float | None]:
    """How many staves are on the page, and how far apart their lines are.

    Staves are counted as *bands* -- runs of rows carrying long horizontal ink,
    with small interruptions bridged -- so one staff gives one band whether its
    five lines come out cleanly separated or merged into a single thick blob by
    thresholding. Counting lines and dividing by five reported zero staves on
    pages with tight spacing, and "there is no sheet music in this photo" is a
    bad thing to tell somebody about a photo of sheet music.

    Spacing is estimated geometrically first and then refined by
    autocorrelation in a tight window around that estimate.
    """
    lines_only = staff_line_mask(binary)
    if lines_only.max() == 0:
        return 0, None

    profile = (lines_only > 0).sum(axis=1).astype(np.float32)
    ranges = _line_rows(profile)
    if not ranges:
        return 0, None

    centres = [(top + bottom) / 2 for top, bottom in ranges]
    gaps = np.diff(centres) if len(centres) > 1 else np.array([])

    if gaps.size >= 4:
        # Four of every five gaps within a staff are the staff spacing, so the
        # median is the spacing even with the larger inter-staff gaps mixed in.
        typical = float(np.median(gaps))
        within = gaps[gaps <= typical * 1.5]
        spacing = float(np.median(within)) if within.size else typical
    else:
        # Too few distinct rows: the five lines of each staff have merged, so
        # each run is a whole staff and a staff spans four spacings.
        heights = [bottom - top for top, bottom in ranges]
        spacing = max(2.0, float(np.median(heights)) / 4.0)

    bands = _merge_bands(profile, bridge=int(round(spacing * 1.8)))
    if not bands:
        return 0, None

    # A five-line staff spans four spacings. Requiring most of that keeps a
    # stray horizontal rule -- a title underline, a page border -- from
    # counting as a staff, while a band far thicker than a staff is some other
    # structure entirely.
    plausible = [
        (top, bottom)
        for top, bottom in bands
        if spacing * 1.5 <= (bottom - top) <= spacing * 12.0
    ]

    # Re-derive the spacing from how tall a staff band is. That measurement is
    # immune to a line splitting into two detected rows, which halves the
    # median gap and was making the spacing come out at half its real value on
    # any page where contrast enhancement left a halo around the lines.
    if plausible:
        span = float(np.median([bottom - top for top, bottom in plausible]))
        if span > 0:
            spacing = max(2.0, span / 4.0)

    refined = _dominant_period(
        profile, low=max(3, int(spacing * 0.75)), high=max(5, int(spacing * 1.3))
    )
    if refined and 0.75 * spacing <= refined <= 1.3 * spacing:
        spacing = refined

    # With the spacing settled, the bridge is right too; recount.
    bands = _merge_bands(profile, bridge=int(round(spacing * 1.8)))
    plausible = [
        (top, bottom)
        for top, bottom in bands
        if spacing * 1.5 <= (bottom - top) <= spacing * 12.0
    ]
    if plausible:
        staves = len(plausible)
    elif len(bands) == 1:
        staves = 1
    else:
        staves = len(bands)

    return max(0, staves), (spacing if spacing > 0 else None)


def _merge_bands(profile: np.ndarray, bridge: int) -> list[tuple[int, int]]:
    """Row ranges of long horizontal ink, joining ranges closer than `bridge`."""
    bands: list[tuple[int, int]] = []
    for top, bottom in _line_rows(profile):
        if bands and top - bands[-1][1] <= max(1, bridge):
            bands[-1] = (bands[-1][0], bottom)
        else:
            bands.append((top, bottom))
    return bands


def count_staves(binary: np.ndarray) -> int:
    return analyse_staves(binary)[0]


# ──────────────────────────── geometry ────────────────────────────


def rotate(image: np.ndarray, degrees: float) -> np.ndarray:
    if abs(degrees) < 0.12:
        return image
    height, width = image.shape[:2]
    centre = (width / 2, height / 2)
    matrix = cv2.getRotationMatrix2D(centre, degrees, 1.0)
    cosine, sine = abs(matrix[0, 0]), abs(matrix[0, 1])
    new_width = int(height * sine + width * cosine)
    new_height = int(height * cosine + width * sine)
    matrix[0, 2] += new_width / 2 - centre[0]
    matrix[1, 2] += new_height / 2 - centre[1]
    return cv2.warpAffine(
        image,
        matrix,
        (new_width, new_height),
        flags=cv2.INTER_CUBIC,
        borderMode=cv2.BORDER_REPLICATE,
    )


def find_page_quad(gray: np.ndarray) -> np.ndarray | None:
    """Find the sheet of paper, if it is convincingly there.

    Conservative on purpose: a wrong quadrilateral crops music away, which is
    worse than leaving the keystone in. When this returns None the caller
    simply skips perspective correction, and the variant selection downstream
    still has a straightened candidate to fall back on.
    """
    height, width = gray.shape[:2]
    scale = 600.0 / max(height, width)
    small = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    small = cv2.GaussianBlur(small, (5, 5), 0)
    edges = cv2.Canny(small, 40, 140)
    edges = cv2.dilate(edges, np.ones((3, 3), np.uint8), iterations=1)

    contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    page_area = small.shape[0] * small.shape[1]
    best: np.ndarray | None = None
    best_area = 0.0

    for contour in sorted(contours, key=cv2.contourArea, reverse=True)[:8]:
        area = cv2.contourArea(contour)
        if area < page_area * 0.30:
            continue
        perimeter = cv2.arcLength(contour, True)
        approx = cv2.approxPolyDP(contour, 0.02 * perimeter, True)
        if len(approx) != 4 or not cv2.isContourConvex(approx):
            continue
        if not _plausible_page_corners(approx.reshape(4, 2)):
            continue
        if area > best_area:
            best_area = area
            best = approx.reshape(4, 2).astype(np.float32) / scale

    if best is None:
        return None
    # A quad that is essentially the whole frame means there is nothing to
    # correct; warping it would only resample the image for no reason.
    if best_area > page_area * 0.97:
        return None
    return _order_corners(best)


def _plausible_page_corners(quad: np.ndarray) -> bool:
    """Reject quadrilaterals whose corners are too far from right angles."""
    ordered = _order_corners(quad.astype(np.float32))
    for index in range(4):
        previous = ordered[index - 1]
        current = ordered[index]
        following = ordered[(index + 1) % 4]
        v1 = previous - current
        v2 = following - current
        norm = np.linalg.norm(v1) * np.linalg.norm(v2)
        if norm == 0:
            return False
        angle = math.degrees(math.acos(float(np.clip(np.dot(v1, v2) / norm, -1.0, 1.0))))
        if not 55.0 <= angle <= 125.0:
            return False
    return True


def _order_corners(quad: np.ndarray) -> np.ndarray:
    """Order as top-left, top-right, bottom-right, bottom-left."""
    centre = quad.mean(axis=0)
    angles = np.arctan2(quad[:, 1] - centre[1], quad[:, 0] - centre[0])
    ordered = quad[np.argsort(angles)]
    # Rotate so the first point is the top-left-most.
    start = int(np.argmin(ordered.sum(axis=1)))
    return np.roll(ordered, -start, axis=0).astype(np.float32)


def warp_page(image: np.ndarray, quad: np.ndarray) -> np.ndarray:
    """Flatten the detected page to a rectangle."""
    top_left, top_right, bottom_right, bottom_left = quad
    width = int(
        max(np.linalg.norm(top_right - top_left), np.linalg.norm(bottom_right - bottom_left))
    )
    height = int(
        max(np.linalg.norm(bottom_left - top_left), np.linalg.norm(bottom_right - top_right))
    )
    if width < MIN_USEFUL_WIDTH // 2 or height < 200:
        return image
    destination = np.array(
        [[0, 0], [width - 1, 0], [width - 1, height - 1], [0, height - 1]], dtype=np.float32
    )
    matrix = cv2.getPerspectiveTransform(quad, destination)
    return cv2.warpPerspective(image, matrix, (width, height), flags=cv2.INTER_CUBIC)


def effective_staff_space(staff_space: float | None, width: int) -> float | None:
    """Staff spacing as the model will see it, after its resize to 1920 wide.

    The number to reason about: the raw pixel spacing on a 4000 px photo says
    nothing about whether the notes will be resolvable once the page has been
    squeezed to 1920.
    """
    if not staff_space or staff_space <= 0 or width <= 0:
        return None
    return staff_space * HOMR_TARGET_WIDTH / width


def crop_to_content(
    gray: np.ndarray, binary: np.ndarray, margin_ratio: float = 0.02
) -> tuple[np.ndarray, bool]:
    """Trim the frame down to the music.

    This is what makes the staves bigger in the model's eyes, because the crop
    changes the ratio between staff size and page width, and that ratio is all
    that survives HOMR's resize.

    Driven by the staff lines rather than by all ink, so a caption, a thumb at
    the edge of the frame or the shadow of the phone does not hold the crop
    open. Refuses to crop when the result would be implausibly small, since
    cropping music away is much worse than leaving margin in.
    """
    lines = staff_line_mask(binary)
    source = lines if lines.max() > 0 else binary
    coordinates = cv2.findNonZero(source)
    if coordinates is None:
        return gray, False

    x, y, width, height = cv2.boundingRect(coordinates)
    page_height, page_width = gray.shape[:2]
    if width <= 0 or height <= 0:
        return gray, False

    # A crop that keeps almost everything is not worth the resample; one that
    # throws most of the page away is a detection failure, not a crop.
    area_ratio = (width * height) / float(page_height * page_width)
    if area_ratio > 0.92 or area_ratio < 0.06:
        return gray, False

    margin_x = int(page_width * margin_ratio)
    margin_y = int(page_height * margin_ratio)
    left = max(0, x - margin_x)
    top = max(0, y - margin_y)
    right = min(page_width, x + width + margin_x)
    bottom = min(page_height, y + height + margin_y)
    if right - left < 200 or bottom - top < 80:
        return gray, False

    logger.info(
        "Cropped to content: %dx%d -> %dx%d", page_width, page_height, right - left, bottom - top
    )
    return gray[top:bottom, left:right], True


# ──────────────────────────── public API ────────────────────────────


def blur_score(gray: np.ndarray) -> float:
    """Variance of the Laplacian: low means the photo is out of focus."""
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


@dataclass
class _Prepared:
    original_gray: np.ndarray
    normalised: np.ndarray
    binary: np.ndarray
    report: ImageReport


def _prepare(payload: bytes) -> _Prepared:
    """Run the whole pipeline once and report what it found.

    Analysis and variant building share this so the numbers shown to the user
    are the numbers the model will actually see -- measuring a crooked page and
    then straightening it produced misleading reports (a page of four tilted
    staves counted as twelve).
    """
    image = decode(payload)
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    quad = find_page_quad(gray)
    if quad is not None:
        working = cv2.cvtColor(warp_page(image, quad), cv2.COLOR_BGR2GRAY)
        logger.info("Perspective correction applied")
    else:
        working = gray

    flattened = flatten_illumination(working)
    straightened, skew = deskew(flattened)
    if skew:
        logger.info("Deskewed by %.2f degrees", skew)

    cropped, was_cropped = crop_to_content(straightened, binarize(straightened))
    normalised = _limit_size(cropped)

    binary = binarize(normalised)
    staves, space = analyse_staves(binary)
    _, thickness = estimate_staff_metrics(binary)
    sharpness = blur_score(working)
    at_model = effective_staff_space(space, int(normalised.shape[1]))

    problems: list[str] = []
    if sharpness < BLUR_THRESHOLD:
        problems.append("desenfocada")
    if gray.shape[1] < MIN_USEFUL_WIDTH:
        problems.append("resolución baja")
    # Report the tilt only if it is still there. A page that arrived at eight
    # degrees and left at zero is not a problem the user needs to hear about;
    # one the pipeline could not straighten is.
    residual = estimate_skew(binary, limit=4.0, step=0.25)
    if abs(residual) > 1.5:
        problems.append("torcida")
    if staves == 0:
        problems.append("sin pentagramas detectados")
    elif at_model is not None and at_model < ACCEPTABLE_STAFF_SPACE[0]:
        # Cropping is the only remedy and it has already been tried, so this is
        # advice for the next photo rather than something we can fix here.
        problems.append("pentagramas pequeños en el encuadre")

    report = ImageReport(
        width=int(normalised.shape[1]),
        height=int(normalised.shape[0]),
        blur_score=sharpness,
        skew_degrees=skew,
        staff_space=space,
        staff_line_thickness=thickness,
        staff_count=staves,
        perspective_corrected=quad is not None,
        cropped=was_cropped,
        effective_staff_space=at_model,
        problems=problems,
    )
    return _Prepared(gray, normalised, binary, report)


def analyze(payload: bytes) -> ImageReport:
    """Inspect a photo and report what would stop it from being recognised."""
    return _prepare(payload).report


def build_variants(payload: bytes, limit: int = 2) -> tuple[list[Variant], ImageReport]:
    """Produce preprocessed candidates, best guess first.

    Returning several is what lets the caller run more than one recognition
    pass and keep the most musically consistent result, instead of betting the
    whole job on one guess about what this particular photo needed.
    """
    prepared = _prepare(payload)

    # Ink on white, which is what the model expects to see.
    binary_page = cv2.bitwise_not(prepared.binary)

    candidates = [
        Variant(
            "normalizada",
            "Enderezada y con iluminación corregida",
            encode_png(prepared.normalised),
        ),
        Variant("binarizada", "Enderezada y binarizada", encode_png(binary_page)),
        Variant(
            "original",
            "Original sin procesar (solo orientación EXIF)",
            encode_png(prepared.original_gray),
        ),
    ]
    return candidates[: max(1, limit)], prepared.report
