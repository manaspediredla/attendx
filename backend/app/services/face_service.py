"""Face recognition service — detection, encoding, and matching.

Uses OpenCV DNN for face detection and either face_recognition (dlib) or
a pure OpenCV fallback for encoding/matching.
"""

import base64
import pickle
import os

import cv2
import numpy as np
from flask import current_app

from app.extensions import db
from app.models.face_encoding import FaceEncoding

# Try to import face_recognition (dlib-based), fall back to OpenCV DNN
try:
    import face_recognition
    USE_DLIB = True
except ImportError:
    USE_DLIB = False

# OpenCV DNN face detector model paths
PROTO_PATH = os.path.join(os.path.dirname(__file__), '..', 'models_data', 'deploy.prototxt')
MODEL_PATH = os.path.join(os.path.dirname(__file__), '..', 'models_data', 'res10_300x300_ssd_iter_140000.caffemodel')

_face_net = None


def _get_face_net():
    """Lazy-load the OpenCV DNN face detector."""
    global _face_net
    if _face_net is None:
        if os.path.exists(PROTO_PATH) and os.path.exists(MODEL_PATH):
            _face_net = cv2.dnn.readNetFromCaffe(PROTO_PATH, MODEL_PATH)
        else:
            # Use Haar cascade as ultimate fallback
            cascade_path = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
            _face_net = cv2.CascadeClassifier(cascade_path)
    return _face_net


def _normalize_image_size(image):
    """Resize large frames so detection/encoding matches registration."""
    if image is not None and image.shape[1] > 1000:
        return cv2.resize(image, (0, 0), fx=0.5, fy=0.5)
    return image


def _primary_face_locations(face_locations):
    """Keep only the largest detected face to avoid false matches."""
    if not face_locations:
        return []
    if len(face_locations) == 1:
        return face_locations

    def area(loc):
        top, right, bottom, left = loc
        return max(0, bottom - top) * max(0, right - left)

    return [max(face_locations, key=area)]


def decode_base64_image(base64_string):
    """Decode a base64 encoded image string to a numpy array (BGR).

    Strips the data URI prefix if present (e.g. 'data:image/jpeg;base64,...').
    """
    if "," in base64_string:
        base64_string = base64_string.split(",")[1]

    img_bytes = base64.b64decode(base64_string)
    img_array = np.frombuffer(img_bytes, dtype=np.uint8)
    image = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
    return image


def detect_faces(image):
    """Detect faces in an image.

    Uses face_recognition (HOG) if available, otherwise OpenCV Haar cascade.

    Args:
        image: BGR numpy array from OpenCV.

    Returns:
        List of face location tuples (top, right, bottom, left).
    """
    if USE_DLIB:
        rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        face_locations = face_recognition.face_locations(
            rgb_image, model="hog", number_of_times_to_upsample=1
        )
        return face_locations

    # OpenCV Haar cascade fallback
    detector = _get_face_net()
    if isinstance(detector, cv2.CascadeClassifier):
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        faces = detector.detectMultiScale(gray, 1.1, 5, minSize=(30, 30))
        # Convert from (x, y, w, h) to (top, right, bottom, left)
        locations = []
        for (x, y, w, h) in faces:
            locations.append((y, x + w, y + h, x))
        return locations
    else:
        # DNN-based detection
        h, w = image.shape[:2]
        blob = cv2.dnn.blobFromImage(cv2.resize(image, (300, 300)), 1.0,
                                      (300, 300), (104.0, 177.0, 123.0))
        detector.setInput(blob)
        detections = detector.forward()
        locations = []
        for i in range(detections.shape[2]):
            confidence = detections[0, 0, i, 2]
            if confidence > 0.5:
                box = detections[0, 0, i, 3:7] * np.array([w, h, w, h])
                x1, y1, x2, y2 = box.astype("int")
                locations.append((y1, x2, y2, x1))
        return locations


def encode_faces(image, face_locations=None):
    """Generate face encodings.

    Uses face_recognition (128-dim) if available, otherwise creates a
    normalized histogram-based feature vector from the face region.

    Args:
        image: BGR numpy array from OpenCV.
        face_locations: Optional pre-computed face locations.

    Returns:
        List of numpy arrays (encoding vectors).
    """
    if USE_DLIB:
        rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        if face_locations is None:
            face_locations = face_recognition.face_locations(rgb_image, model="hog")
        encodings = face_recognition.face_encodings(rgb_image, face_locations)
        return encodings

    # OpenCV fallback — LBPH-style feature extraction
    if face_locations is None:
        face_locations = detect_faces(image)

    encodings = []
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    for (top, right, bottom, left) in face_locations:
        # Extract and normalize face region
        face_roi = gray[top:bottom, left:right]
        if face_roi.size == 0:
            continue

        face_roi = cv2.resize(face_roi, (150, 150))
        face_roi = cv2.equalizeHist(face_roi)

        # Create a multi-scale LBP-like feature vector
        features = []

        # Histogram features at different scales
        for scale in [1, 2, 4]:
            scaled = cv2.resize(face_roi, (150 // scale, 150 // scale))
            hist = cv2.calcHist([scaled], [0], None, [32], [0, 256])
            hist = cv2.normalize(hist, hist).flatten()
            features.extend(hist)

        # Spatial histogram (divide into grid cells)
        cell_h, cell_w = 150 // 5, 150 // 5
        for i in range(5):
            for j in range(5):
                cell = face_roi[i * cell_h:(i + 1) * cell_h, j * cell_w:(j + 1) * cell_w]
                hist = cv2.calcHist([cell], [0], None, [16], [0, 256])
                hist = cv2.normalize(hist, hist).flatten()
                features.extend(hist)

        encoding = np.array(features, dtype=np.float64)
        # Normalize to unit vector
        norm = np.linalg.norm(encoding)
        if norm > 0:
            encoding = encoding / norm

        encodings.append(encoding)

    return encodings


def preview_face_detection(base64_image):
    """Check whether a single frame contains a detectable face."""
    image = decode_base64_image(base64_image)
    if image is None:
        return {"face_detected": False, "face_count": 0, "error": "Failed to decode image"}

    if image.shape[1] > 1000:
        image = cv2.resize(image, (0, 0), fx=0.5, fy=0.5)

    face_locations = detect_faces(image)
    return {
        "face_detected": len(face_locations) > 0,
        "face_count": len(face_locations),
    }


def register_face_encodings(student_id, base64_images):
    """Process multiple images and store face encodings for a student.

    Args:
        student_id: The student's database ID.
        base64_images: List of base64-encoded image strings.

    Returns:
        dict with success status and count of stored encodings.
    """
    stored_count = 0
    errors = []

    for i, img_b64 in enumerate(base64_images):
        try:
            image = decode_base64_image(img_b64)
            if image is None:
                errors.append(f"Image {i + 1}: Failed to decode")
                continue

            # Resize for consistency if too large
            if image.shape[1] > 1000:
                image = cv2.resize(image, (0, 0), fx=0.5, fy=0.5)

            face_locations = detect_faces(image)
            if not face_locations:
                errors.append(f"Image {i + 1}: No face detected")
                continue

            encodings = encode_faces(image, face_locations)
            if not encodings:
                errors.append(f"Image {i + 1}: Failed to encode")
                continue

            # Store the first (primary) face encoding
            encoding_bytes = pickle.dumps(encodings[0])
            face_enc = FaceEncoding(
                student_id=student_id,
                encoding_data=encoding_bytes,
            )
            db.session.add(face_enc)
            stored_count += 1

        except Exception as e:
            errors.append(f"Image {i + 1}: {str(e)}")

    min_required = current_app.config.get("FACE_MIN_IMAGES", 5)

    if stored_count > 0:
        db.session.commit()

    return {
        "success": stored_count >= min_required,
        "stored_count": stored_count,
        "total_images": len(base64_images),
        "min_required": min_required,
        "faces_detected": stored_count,
        "errors": errors,
    }


def load_all_encodings():
    """Load all stored face encodings from the database.

    Returns:
        dict mapping student_id -> list of numpy encoding arrays.
    """
    encoding_map = {}
    all_encodings = FaceEncoding.query.all()

    for fe in all_encodings:
        encoding = pickle.loads(fe.encoding_data)
        if fe.student_id not in encoding_map:
            encoding_map[fe.student_id] = []
        encoding_map[fe.student_id].append(encoding)

    return encoding_map


def _encoding_distances(known_encodings, probe_encoding, enc_dim):
    """Return distance array between probe and known encodings of the same dimension."""
    compatible = [k for k in known_encodings if k.shape[0] == enc_dim]
    if not compatible:
        return np.array([]), compatible
    if USE_DLIB and enc_dim == 128:
        return face_recognition.face_distance(compatible, probe_encoding), compatible
    return np.array([np.linalg.norm(known - probe_encoding) for known in compatible]), compatible


def recognize_student_face(image, student_id):
    """Match a webcam frame against only the logged-in student's stored encodings.

    Rejects when the face is a closer match to any other registered student
    (prevents marking attendance on someone else's account).
    """
    encoding_map = load_all_encodings()
    known_encodings = encoding_map.get(student_id, [])

    if not known_encodings:
        return {
            "face_detected": False,
            "matched": False,
            "confidence": 0.0,
            "distance": None,
            "face_count": 0,
            "encoding_count": 0,
            "impostor_detected": False,
        }

    tolerance = current_app.config.get("FACE_RECOGNITION_TOLERANCE", 0.55)
    min_match_votes = int(current_app.config.get("FACE_MIN_MATCH_VOTES", 2))
    image = _normalize_image_size(image)
    all_face_locations = detect_faces(image)
    if not all_face_locations:
        return {
            "face_detected": False,
            "matched": False,
            "confidence": 0.0,
            "distance": None,
            "face_count": 0,
            "encoding_count": len(known_encodings),
            "impostor_detected": False,
        }

    face_locations = _primary_face_locations(all_face_locations)
    if USE_DLIB:
        rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        face_encodings = face_recognition.face_encodings(
            rgb_image, face_locations, num_jitters=1
        )
    else:
        face_encodings = encode_faces(image, face_locations)

    if not face_encodings:
        return {
            "face_detected": True,
            "matched": False,
            "confidence": 0.0,
            "distance": None,
            "face_count": len(all_face_locations),
            "encoding_count": len(known_encodings),
            "impostor_detected": False,
        }

    probe = face_encodings[0]
    enc_dim = probe.shape[0]
    match_threshold = tolerance if USE_DLIB and enc_dim == 128 else tolerance * 2

    own_distances, own_compatible = _encoding_distances(known_encodings, probe, enc_dim)
    if len(own_distances) == 0:
        return {
            "face_detected": True,
            "matched": False,
            "confidence": 0.0,
            "distance": None,
            "face_count": len(all_face_locations),
            "encoding_count": len(known_encodings),
            "impostor_detected": False,
        }

    own_best = float(np.min(own_distances))
    if USE_DLIB and enc_dim == 128:
        own_votes = int(np.sum(face_recognition.compare_faces(
            own_compatible, probe, tolerance=match_threshold
        )))
    else:
        own_votes = int(np.sum(own_distances <= match_threshold))

    # Block if another student's face is an equal-or-better match.
    impostor_detected = False
    for other_id, other_encodings in encoding_map.items():
        if other_id == student_id:
            continue
        other_distances, _ = _encoding_distances(other_encodings, probe, enc_dim)
        if len(other_distances) == 0:
            continue
        other_best = float(np.min(other_distances))
        if other_best <= own_best:
            impostor_detected = True
            break

    matched = (
        not impostor_detected
        and own_best <= match_threshold
        and own_votes >= min_match_votes
    )
    confidence = max(0.0, round(1.0 - own_best, 4))

    return {
        "face_detected": True,
        "matched": matched,
        "confidence": confidence,
        "distance": round(own_best, 4),
        "face_count": len(all_face_locations),
        "encoding_count": len(known_encodings),
        "match_votes": own_votes,
        "impostor_detected": impostor_detected,
    }


def recognize_face(image, encoding_map=None):
    """Recognize a face in an image against all stored encodings.

    Args:
        image: BGR numpy array from OpenCV.
        encoding_map: Optional pre-loaded encoding map. Loads from DB if None.

    Returns:
        List of dicts with recognition results for each detected face.
    """
    if encoding_map is None:
        encoding_map = load_all_encodings()

    tolerance = current_app.config.get("FACE_RECOGNITION_TOLERANCE", 0.6)

    face_locations = detect_faces(image)
    if not face_locations:
        return []

    face_encodings = encode_faces(image, face_locations)
    results = []

    for encoding, location in zip(face_encodings, face_locations):
        best_match_id = None
        best_distance = float("inf")
        enc_dim = encoding.shape[0]  # 128 for dlib, 496 for fallback

        for student_id, known_encodings in encoding_map.items():
            try:
                # Filter to only same-dimension encodings
                compatible = [k for k in known_encodings if k.shape[0] == enc_dim]
                if not compatible:
                    continue

                if USE_DLIB and enc_dim == 128:
                    distances = face_recognition.face_distance(compatible, encoding)
                    match_threshold = tolerance
                else:
                    distances = np.array([
                        np.linalg.norm(known - encoding)
                        for known in compatible
                    ])
                    match_threshold = tolerance * 2

                if len(distances) > 0:
                    min_distance = float(np.min(distances))
                    if min_distance < best_distance:
                        best_distance = min_distance
                        if min_distance <= match_threshold:
                            best_match_id = student_id
            except Exception as e:
                current_app.logger.warning(f"Error comparing with student {student_id}: {e}")
                continue

        results.append({
            "student_id": best_match_id,
            "confidence": round(1.0 - best_distance, 4) if best_match_id else 0.0,
            "distance": round(float(best_distance), 4) if best_distance != float("inf") else 999.0,
            "location": location,
        })

    return results


def draw_recognition_results(image, results, student_names):
    """Draw bounding boxes and labels on the image.

    Args:
        image: BGR numpy array.
        results: List of recognition result dicts.
        student_names: dict mapping student_id -> name string.

    Returns:
        Base64-encoded JPEG of the annotated image.
    """
    for result in results:
        top, right, bottom, left = result["location"]
        student_id = result["student_id"]

        if student_id and student_id in student_names:
            color = (0, 255, 0)  # Green for recognized
            name = student_names[student_id]
            label = f"{name} ({result['confidence']:.0%})"
        else:
            color = (0, 0, 255)  # Red for unknown
            label = "Unknown"

        # Draw rectangle
        cv2.rectangle(image, (left, top), (right, bottom), color, 2)

        # Label background
        label_size = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 1)[0]
        cv2.rectangle(
            image,
            (left, bottom),
            (left + label_size[0] + 4, bottom + label_size[1] + 10),
            color,
            cv2.FILLED,
        )
        cv2.putText(
            image, label, (left + 2, bottom + label_size[1] + 5),
            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1,
        )

    # Encode annotated image to base64
    _, buffer = cv2.imencode(".jpg", image)
    annotated_b64 = base64.b64encode(buffer).decode("utf-8")
    return f"data:image/jpeg;base64,{annotated_b64}"
