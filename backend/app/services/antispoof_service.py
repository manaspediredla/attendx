"""Anti-spoofing service — texture, frequency, and temporal liveness analysis.

Uses only OpenCV + NumPy (no new dependencies). Detects photos displayed on
screens, printed images, and replay videos by analysing image characteristics
that differ between a real 3-D face and a flat 2-D reproduction.
"""

import base64
import logging

import cv2
import numpy as np

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Thresholds — tuned for typical 720p webcam captures
# ---------------------------------------------------------------------------
# Laplacian variance: real skin texture is richer than screen-displayed images.
# Real faces typically score > 40; screens/prints often < 25.
LAPLACIAN_THRESHOLD = 15.0        # below → suspect flat surface

# High-frequency energy ratio: screens produce moiré / pixel-grid artefacts
# that boost specific high-freq bands. We measure the *ratio* of energy in
# the outer ring of the FFT magnitude spectrum vs the total.
HF_ENERGY_RATIO_THRESHOLD = 0.35  # above → suspect screen

# Colour saturation uniformity: screens emit very uniform backlight so the
# saturation channel has low variance.  Real faces in natural light have
# uneven saturation across skin, hair, lips, etc.
SAT_VAR_THRESHOLD = 200.0         # below → suspect flat surface

# Temporal motion: between two frames captured ~1 s apart, a real face shows
# slight position / landmark jitter (breathing, micro-saccades).  A still
# photo has near-zero inter-frame difference inside the face region.
MOTION_THRESHOLD = 1.8            # below → suspect static image

# Aggregate: at least N checks must flag "real" to pass overall.
MIN_REAL_CHECKS = 2               # out of 4 checks total


# ---------------------------------------------------------------------------
# Individual analysis functions
# ---------------------------------------------------------------------------

def _decode_image(b64: str) -> np.ndarray | None:
    """Decode a base64 image string to BGR ndarray."""
    try:
        if "," in b64:
            b64 = b64.split(",", 1)[1]
        raw = base64.b64decode(b64)
        arr = np.frombuffer(raw, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        return img
    except Exception:
        return None


def _extract_face_region(image: np.ndarray) -> np.ndarray | None:
    """Crop the largest face region using Haar cascade (fast, no extra deps)."""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    cascade = cv2.CascadeClassifier(
        cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    )
    faces = cascade.detectMultiScale(gray, 1.1, 5, minSize=(60, 60))
    if len(faces) == 0:
        return None
    # Largest face
    x, y, w, h = max(faces, key=lambda f: f[2] * f[3])
    return image[y : y + h, x : x + w]


def analyze_texture(image: np.ndarray) -> dict:
    """Laplacian variance of the face region.

    Real skin has fine-grained texture yielding higher variance.
    A screen-displayed photo is re-sampled through a pixel grid then through
    the camera sensor, which smooths micro-texture → lower variance.
    """
    face = _extract_face_region(image)
    if face is None:
        return {"is_real": False, "texture_score": 0.0, "detail": "no_face"}

    gray = cv2.cvtColor(face, cv2.COLOR_BGR2GRAY)
    # Equalise to normalise brightness differences
    gray = cv2.equalizeHist(gray)
    lap = cv2.Laplacian(gray, cv2.CV_64F)
    variance = float(lap.var())

    return {
        "is_real": variance >= LAPLACIAN_THRESHOLD,
        "texture_score": round(variance, 2),
        "detail": f"laplacian_var={variance:.1f} threshold={LAPLACIAN_THRESHOLD}",
    }


def analyze_frequency(image: np.ndarray) -> dict:
    """FFT-based frequency analysis of the face region.

    Screens introduce periodic pixel-grid artefacts visible as peaks in the
    high-frequency band of the 2-D Fourier transform.
    """
    face = _extract_face_region(image)
    if face is None:
        return {"is_real": False, "frequency_score": 0.0, "detail": "no_face"}

    gray = cv2.cvtColor(face, cv2.COLOR_BGR2GRAY)
    gray = cv2.resize(gray, (128, 128))

    f = np.fft.fft2(gray.astype(np.float32))
    fshift = np.fft.fftshift(f)
    magnitude = np.log1p(np.abs(fshift))

    h, w = magnitude.shape
    cy, cx = h // 2, w // 2
    radius = min(cy, cx)

    # Total energy
    total_energy = float(magnitude.sum()) + 1e-10

    # High-frequency ring: outer 30 % of the spectrum
    Y, X = np.ogrid[:h, :w]
    dist = np.sqrt((Y - cy) ** 2 + (X - cx) ** 2)
    hf_mask = dist > (radius * 0.7)
    hf_energy = float(magnitude[hf_mask].sum())

    ratio = hf_energy / total_energy

    return {
        "is_real": ratio <= HF_ENERGY_RATIO_THRESHOLD,
        "frequency_score": round(ratio, 4),
        "detail": f"hf_ratio={ratio:.4f} threshold={HF_ENERGY_RATIO_THRESHOLD}",
    }


def analyze_color(image: np.ndarray) -> dict:
    """Colour-saturation variance in the face region.

    Screens emit very uniform backlight → low saturation variance.
    Real faces under natural light have uneven saturation (skin, lips,
    eyebrows, shadows).
    """
    face = _extract_face_region(image)
    if face is None:
        return {"is_real": False, "color_score": 0.0, "detail": "no_face"}

    hsv = cv2.cvtColor(face, cv2.COLOR_BGR2HSV)
    sat = hsv[:, :, 1].astype(np.float64)
    sat_var = float(sat.var())

    return {
        "is_real": sat_var >= SAT_VAR_THRESHOLD,
        "color_score": round(sat_var, 2),
        "detail": f"sat_var={sat_var:.1f} threshold={SAT_VAR_THRESHOLD}",
    }


def analyze_temporal(frames: list[np.ndarray]) -> dict:
    """Inter-frame motion analysis.

    Compare face regions across consecutive frames. A real face shows
    micro-movements (breathing, slight head sway). A static photo on
    a phone shows near-zero inter-frame difference in the face area.
    """
    if len(frames) < 2:
        return {"is_real": False, "motion_score": 0.0, "detail": "need_2+_frames"}

    diffs = []
    prev_face = None

    for frame in frames:
        face = _extract_face_region(frame)
        if face is None:
            continue
        gray = cv2.cvtColor(face, cv2.COLOR_BGR2GRAY)
        gray = cv2.resize(gray, (100, 100))
        gray = cv2.equalizeHist(gray)

        if prev_face is not None:
            diff = cv2.absdiff(gray, prev_face)
            mean_diff = float(diff.mean())
            diffs.append(mean_diff)
        prev_face = gray

    if not diffs:
        return {"is_real": False, "motion_score": 0.0, "detail": "no_faces_across_frames"}

    avg_motion = sum(diffs) / len(diffs)

    return {
        "is_real": avg_motion >= MOTION_THRESHOLD,
        "motion_score": round(avg_motion, 3),
        "detail": f"avg_motion={avg_motion:.3f} threshold={MOTION_THRESHOLD}",
    }


# ---------------------------------------------------------------------------
# Aggregate pipeline
# ---------------------------------------------------------------------------

def run_antispoof_pipeline(base64_frames: list[str]) -> dict:
    """Run the complete anti-spoofing pipeline on a set of captured frames.

    Args:
        base64_frames: List of base64-encoded JPEG/PNG images captured
                       at different moments during the liveness challenge.

    Returns:
        dict with keys:
            is_live (bool): Overall verdict.
            checks_passed (int): How many individual checks passed.
            checks_total (int): Total checks run.
            texture, frequency, color, temporal: Individual results.
            details (str): Human-readable summary.
    """
    images = []
    for b64 in base64_frames:
        img = _decode_image(b64)
        if img is not None:
            # Normalise large frames
            if img.shape[1] > 1000:
                img = cv2.resize(img, (0, 0), fx=0.5, fy=0.5)
            images.append(img)

    if not images:
        return {
            "is_live": False,
            "checks_passed": 0,
            "checks_total": 4,
            "details": "No valid images could be decoded",
        }

    # Use the middle frame for static analyses (most likely to have a good face)
    mid_idx = len(images) // 2
    sample = images[mid_idx]

    texture_result = analyze_texture(sample)
    frequency_result = analyze_frequency(sample)
    color_result = analyze_color(sample)
    temporal_result = analyze_temporal(images)

    checks = [
        texture_result["is_real"],
        frequency_result["is_real"],
        color_result["is_real"],
        temporal_result["is_real"],
    ]
    passed = sum(checks)

    is_live = passed >= MIN_REAL_CHECKS

    details_parts = []
    if not texture_result["is_real"]:
        details_parts.append("flat_texture")
    if not frequency_result["is_real"]:
        details_parts.append("screen_freq_pattern")
    if not color_result["is_real"]:
        details_parts.append("uniform_color")
    if not temporal_result["is_real"]:
        details_parts.append("no_motion")

    logger.info(
        "Antispoof result: is_live=%s passed=%d/%d texture=%.1f freq=%.4f "
        "color=%.1f motion=%.3f flags=%s",
        is_live, passed, len(checks),
        texture_result["texture_score"],
        frequency_result["frequency_score"],
        color_result["color_score"],
        temporal_result["motion_score"],
        ",".join(details_parts) or "none",
    )

    return {
        "is_live": is_live,
        "checks_passed": passed,
        "checks_total": len(checks),
        "texture": texture_result,
        "frequency": frequency_result,
        "color": color_result,
        "temporal": temporal_result,
        "details": ", ".join(details_parts) if details_parts else "all_checks_passed",
    }
