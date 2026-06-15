"""Attendance session and record routes."""

from datetime import datetime, timedelta

from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import get_jwt_identity, jwt_required

from app.extensions import db
from app.models.user import User
from app.models.student import Student
from app.models.attendance_session import AttendanceSession
from app.models.face_encoding import FaceEncoding
from app.services.attendance_service import (
    is_marking_window_open,
    get_session_phase,
    sync_session_status,
    start_session,
    start_end_verification,
    end_session,
    mark_start,
    mark_end,
    get_live_results,
    get_student_attendance,
    get_student_stats,
    get_dashboard_stats,
    get_student_existing_record,
    parse_session_datetime,
)
from app.services.face_service import (
    decode_base64_image,
    recognize_student_face,
)
from app.services.validation_service import validate_gps, validate_network, get_validation_status
from app.utils.decorators import teacher_or_admin_required, student_required, log_audit
from app.utils.request_helpers import get_client_ip
import face_recognition
import numpy as np

attendance_bp = Blueprint("attendance", __name__, url_prefix="/api/attendance")


def _anti_spoof_check(frames_b64, min_frames=3, min_yaw_variance=0.015):
    """Check multiple frames for natural head micro-rotations.

    Computes face symmetry (nose position relative to eyes) for each frame.
    For a photo on a phone, this ratio stays CONSTANT regardless of phone movement.
    For a real person, natural head micro-rotations cause this ratio to vary.
    Returns (passed: bool, reason: str).
    """
    if not frames_b64 or len(frames_b64) < min_frames:
        return True, "insufficient_frames"  # Skip if not enough frames sent

    yaw_ratios = []
    for b64 in frames_b64[:6]:  # max 6 frames
        img = decode_base64_image(b64)
        if img is None:
            continue
        # Downscale for speed
        small = img[::2, ::2]
        landmarks_list = face_recognition.face_landmarks(small)
        if not landmarks_list:
            continue
        lm = landmarks_list[0]
        # Nose tip (middle point)
        nose_bridge = lm.get('nose_tip', [])
        left_eye = lm.get('left_eye', [])
        right_eye = lm.get('right_eye', [])
        if not nose_bridge or not left_eye or not right_eye:
            continue
        nose_x = nose_bridge[2][0] if len(nose_bridge) > 2 else nose_bridge[0][0]
        le_cx = sum(p[0] for p in left_eye) / len(left_eye)
        re_cx = sum(p[0] for p in right_eye) / len(right_eye)
        eye_span = re_cx - le_cx
        if eye_span > 0:
            yaw_ratios.append((nose_x - le_cx) / eye_span)

    if len(yaw_ratios) < min_frames:
        return True, "landmarks_not_detected"  # Can't verify, allow

    yaw_std = float(np.std(yaw_ratios))

    if yaw_std < min_yaw_variance:
        return False, f"static_face_detected (yaw_std={yaw_std:.4f}, min={min_yaw_variance})"

    return True, f"motion_ok (yaw_std={yaw_std:.4f})"


def _session_dict(session):
    """Serialize session with computed phase."""
    sync_session_status(session)
    data = session.to_dict()
    data["phase"] = get_session_phase(session)
    return data


@attendance_bp.route("/start", methods=["POST"])
@teacher_or_admin_required
def start_attendance_session():
    """Create a new attendance session with scheduled time windows.

    Expects JSON:
    {
        "subject": str,
        "section": str,
        "department": str,
        "college": str,
        "session_date": "YYYY-MM-DD",
        "class_start_time": "HH:MM",
        "attendance_monitoring_end": "HH:MM",
        "meeting_end_time": "HH:MM",
        "end_verification_start": "HH:MM",
        "end_verification_end": "HH:MM"
    }
    """
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body required"}), 400

    subject = data.get("subject", "").strip()
    section = data.get("section", "").strip()
    department = data.get("department", "").strip()
    college = data.get("college", data.get("campus", "")).strip()
    access_key = data.get("access_key", "").strip()

    required = ["subject", "section", "department",
                "class_start_time", "attendance_monitoring_end",
                "meeting_end_time", "end_verification_start", "end_verification_end"]
    missing = [f for f in required if not data.get(f, "").strip()]
    if not college:
        missing.append("college")
    if not access_key:
        missing.append("access_key")
    if missing:
        return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400

    session_date_str = data.get("session_date", "").strip()
    if session_date_str:
        session_date = datetime.strptime(session_date_str, "%Y-%m-%d").date()
    else:
        session_date = datetime.now().date()

    teacher_id = int(get_jwt_identity())

    # Only block if the SAME teacher already has an active session for this subject+section
    active = AttendanceSession.query.filter(
        AttendanceSession.teacher_id == teacher_id,
        AttendanceSession.section == section,
        AttendanceSession.subject == subject,
        AttendanceSession.status.in_(["active", "end_verification"]),
    ).first()
    if active:
        return jsonify({
            "error": "You already have an active session for this subject and section",
            "session": _session_dict(active),
        }), 409

    # teacher_id already set above

    session = start_session(
        teacher_id=teacher_id,
        subject=subject,
        section=section,
        department=department,
        college=college,
        session_date=session_date,
        class_start_time=data["class_start_time"],
        attendance_monitoring_end=data["attendance_monitoring_end"],
        meeting_end_time=data["meeting_end_time"],
        end_verification_start=data["end_verification_start"],
        end_verification_end=data["end_verification_end"],
        grace_period=int(data.get("grace_period", 0)),
        access_key=access_key,
    )

    log_audit("session_created", f"Session #{session.id} '{subject}' for {section} at {college}")

    return jsonify({
        "message": "Attendance session created",
        "session_id": session.id,
        "session": _session_dict(session),
    }), 201


@attendance_bp.route("/start-end-verification", methods=["POST"])
@teacher_or_admin_required
def begin_end_verification():
    """Manually start end verification (optional — auto-transitions by schedule)."""
    data = request.get_json()
    if not data or "session_id" not in data:
        return jsonify({"error": "session_id is required"}), 400

    session, error = start_end_verification(data["session_id"])
    if error:
        return jsonify({"error": error}), 400

    log_audit("end_verification_started", f"End verification for session {session.id}")
    return jsonify({
        "message": "End verification phase started",
        "session": _session_dict(session),
    }), 200


@attendance_bp.route("/end", methods=["POST"])
@teacher_or_admin_required
def end_attendance_session():
    """End session and finalize all attendance statuses."""
    data = request.get_json()
    if not data or "session_id" not in data:
        return jsonify({"error": "session_id is required"}), 400

    # Verify teacher ownership (super_admin can end any)
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if user.role == "teacher":
        session_check = AttendanceSession.query.get(data["session_id"])
        if session_check and session_check.teacher_id != user_id:
            return jsonify({"error": "You can only end your own sessions"}), 403

    session, error = end_session(data["session_id"])
    if error:
        return jsonify({"error": error}), 400

    log_audit("session_ended", f"Session {session.id} ended and finalized")
    return jsonify({
        "message": "Attendance session ended",
        "session": _session_dict(session),
    }), 200


@attendance_bp.route("/update-session", methods=["PUT"])
@teacher_or_admin_required
def update_attendance_session():
    """Update session details (subject, times, access key) even while live."""
    data = request.get_json()
    if not data or "session_id" not in data:
        return jsonify({"error": "session_id is required"}), 400

    session_id = data["session_id"]
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)

    session = AttendanceSession.query.get(session_id)
    if not session:
        return jsonify({"error": "Session not found"}), 404

    if session.status == "completed":
        return jsonify({"error": "Cannot edit a completed session"}), 400

    # Only the session owner or super_admin can edit
    if user.role == "teacher" and session.teacher_id != user_id:
        return jsonify({"error": "You can only edit your own sessions"}), 403

    # Update basic fields
    if "subject" in data:
        session.subject = data["subject"].strip()
    if "section" in data:
        session.section = data["section"].strip()
    if "department" in data:
        session.department = data["department"].strip()
    if "college" in data or "campus" in data:
        session.campus = (data.get("college") or data.get("campus", "")).strip()
    if "access_key" in data:
        session.access_key = data["access_key"].strip() or None
    if "grace_period" in data:
        session.grace_period_minutes = int(data["grace_period"])

    # Update time windows
    session_date = session.session_date
    if "session_date" in data and data["session_date"]:
        session_date = datetime.strptime(data["session_date"], "%Y-%m-%d").date()
        session.session_date = session_date

    if "class_start_time" in data and data["class_start_time"]:
        new_start = parse_session_datetime(session_date, data["class_start_time"])
        session.attendance_window_start = new_start
        session.start_time = new_start
    if "attendance_monitoring_end" in data and data["attendance_monitoring_end"]:
        session.attendance_window_end = parse_session_datetime(session_date, data["attendance_monitoring_end"])
    if "meeting_end_time" in data and data["meeting_end_time"]:
        session.end_time = parse_session_datetime(session_date, data["meeting_end_time"])
    if "end_verification_start" in data and data["end_verification_start"]:
        session.end_verification_start = parse_session_datetime(session_date, data["end_verification_start"])
    if "end_verification_end" in data and data["end_verification_end"]:
        session.end_verification_end = parse_session_datetime(session_date, data["end_verification_end"])

    db.session.commit()
    sync_session_status(session)

    log_audit("session_updated", f"Session {session.id} updated by teacher {user_id}")
    return jsonify({
        "message": "Session updated successfully",
        "session": _session_dict(session),
    }), 200


@attendance_bp.route("/verify-access-key", methods=["POST"])
@student_required
def verify_access_key():
    """Verify a session access key before allowing attendance."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body required"}), 400

    session_id = data.get("session_id")
    access_key = data.get("access_key", "").strip()

    if not session_id or not access_key:
        return jsonify({"error": "session_id and access_key are required"}), 400

    session = AttendanceSession.query.get(session_id)
    if not session:
        return jsonify({"error": "Session not found"}), 404

    if session.access_key and session.access_key != access_key:
        return jsonify({"valid": False, "error": "Invalid Session Access Key"}), 403

    return jsonify({"valid": True, "message": "Access key verified"}), 200


@attendance_bp.route("/validate", methods=["POST"])
@student_required
def validate_attendance_requirements():
    """Pre-check GPS and network validation before marking attendance."""
    data = request.get_json() or {}
    latitude = data.get("latitude")
    longitude = data.get("longitude")
    reported_public_ip = data.get("public_ip")

    client_ip = get_client_ip(request)
    result = get_validation_status(latitude, longitude, client_ip, reported_public_ip)

    return jsonify({
        **result,
        "client_ip": client_ip,
    }), 200


@attendance_bp.route("/verify-face", methods=["POST"])
@student_required
def verify_student_face():
    """Live face scan preview for attendance marking."""
    data = request.get_json() or {}
    image_b64 = data.get("image")
    if not image_b64:
        return jsonify({"error": "image is required"}), 400

    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user or not user.student:
        return jsonify({"error": "Student profile not found"}), 404

    student = user.student
    min_face_images = current_app.config.get("FACE_MIN_IMAGES", 20)
    encoding_count = FaceEncoding.query.filter_by(student_id=student.id).count()

    if not student.face_registered or encoding_count < min_face_images:
        return jsonify({
            "face_detected": False,
            "matched": False,
            "confidence": 0,
            "registered": False,
            "encoding_count": encoding_count,
            "required": min_face_images,
            "message": "Face not enrolled. Complete face enrollment on first login.",
        }), 200

    image = decode_base64_image(image_b64)
    if image is None:
        return jsonify({"error": "Failed to decode image"}), 400

    result = recognize_student_face(image, student.id)
    tolerance = current_app.config.get("FACE_RECOGNITION_TOLERANCE", 0.55)
    return jsonify({
        **result,
        "registered": True,
        "accuracy_percent": round((result.get("confidence") or 0) * 100, 1),
        "threshold_percent": round((1.0 - tolerance) * 100, 1),
    }), 200


@attendance_bp.route("/mark", methods=["POST"])
@student_required
def student_mark_attendance():
    """Student marks attendance with GPS, network, and face validation."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body required"}), 400

    session_id = data.get("session_id")
    image_b64 = data.get("image")
    latitude = data.get("latitude")
    longitude = data.get("longitude")
    reported_public_ip = data.get("public_ip")

    if not session_id or not image_b64:
        return jsonify({"error": "session_id and image are required"}), 400

    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user or not user.student:
        return jsonify({"error": "Student profile not found"}), 404

    student = user.student
    min_face_images = current_app.config.get("FACE_MIN_IMAGES", 20)
    encoding_count = FaceEncoding.query.filter_by(student_id=student.id).count()

    if not student.face_registered or encoding_count < min_face_images:
        return jsonify({
            "error": "Face biometrics not enrolled. Complete enrollment on first login.",
            "encoding_count": encoding_count,
            "required": min_face_images,
        }), 400

    session = AttendanceSession.query.get(session_id)
    if not session:
        return jsonify({"error": "Session not found"}), 404

    # Verify access key
    access_key = data.get("access_key", "").strip()
    if session.access_key and session.access_key != access_key:
        return jsonify({"error": "Invalid Session Access Key"}), 403

    sync_session_status(session)
    phase = get_session_phase(session)

    if phase not in ("start_window", "end_window"):
        return jsonify({
            "error": "Attendance window is not open",
            "phase": phase,
        }), 400

    existing = get_student_existing_record(session_id, student.id)
    if phase == "start_window" and existing and existing.start_marked_at:
        return jsonify({
            "error": "Attendance Already Recorded",
            "message": "Attendance Already Recorded",
            "status": existing.status,
            "locked": True,
        }), 409

    if phase == "end_window":
        if not existing or not existing.start_marked_at:
            return jsonify({
                "error": "Not eligible for end verification",
                "message": "You did not mark attendance at the start of class",
            }), 403
        if existing.end_marked_at:
            return jsonify({
                "error": "Attendance Already Recorded",
                "message": "Attendance Already Recorded",
                "status": existing.status,
                "locked": True,
            }), 409

    gps_result = validate_gps(latitude, longitude)
    if not gps_result["validated"]:
        return jsonify({
            "error": "GPS validation failed",
            "details": gps_result["reason"],
        }), 403

    client_ip = get_client_ip(request)
    network_result = validate_network(client_ip, reported_public_ip)
    if not network_result["validated"]:
        return jsonify({
            "error": "Network validation failed",
            "details": network_result["reason"],
        }), 403

    image = decode_base64_image(image_b64)
    if image is None:
        return jsonify({"error": "Failed to decode image"}), 400

    # ── Anti-spoofing: multi-frame motion check ──────────────
    anti_spoof_frames = data.get("anti_spoof_frames", [])
    spoof_passed, spoof_reason = _anti_spoof_check(anti_spoof_frames)
    if not spoof_passed:
        log_audit(
            "anti_spoof_failed",
            f"Student {student.roll_number} failed anti-spoofing: {spoof_reason}",
        )
        return jsonify({
            "error": "Anti-spoofing check failed",
            "message": "Static face detected — use a real face, not a photo or screen.",
            "details": spoof_reason,
        }), 403

    face_result = recognize_student_face(image, student.id)

    if not face_result["face_detected"]:
        return jsonify({
            "error": "No face detected in the image",
            "accuracy_percent": 0,
        }), 403

    if not face_result["matched"]:
        return jsonify({
            "error": "Face Verification Failed",
            "message": "Face Verification Failed",
            "accuracy_percent": round((face_result.get("confidence") or 0) * 100, 1),
        }), 403

    college_name = gps_result.get("campus_name") or student.college_name
    city_name = gps_result.get("city_name") or student.city_name

    if phase == "start_window":
        record, msg = mark_start(
            session_id, student.id, face_result["confidence"],
            gps_lat=latitude, gps_lng=longitude,
            gps_validated=gps_result["validated"],
            network_validated=network_result["validated"],
            client_ip=client_ip,
            campus_name=college_name,
            city_name=city_name,
        )
        phase_label = "start"
    else:
        record, msg = mark_end(
            session_id, student.id, face_result["confidence"],
            gps_lat=latitude, gps_lng=longitude,
            gps_validated=gps_result["validated"],
            network_validated=network_result["validated"],
            client_ip=client_ip,
            campus_name=college_name,
            city_name=city_name,
        )
        phase_label = "end"

    if msg:
        if "Already Recorded" in msg:
            return jsonify({
                "error": "Attendance Already Recorded",
                "message": "Attendance Already Recorded",
                "locked": True,
            }), 409
        return jsonify({"error": msg}), 400

    accuracy = round((face_result["confidence"] or 0) * 100, 1)
    log_audit(
        f"attendance_mark_{phase_label}",
        f"Student {student.roll_number} marked {phase_label} for session {session_id} "
        f"({accuracy}% confidence, college: {college_name})",
    )

    return jsonify({
        "message": f"Attendance marked successfully ({phase_label} verification)",
        "status": record.status if record else "error",
        "confidence": face_result["confidence"],
        "accuracy_percent": accuracy,
        "gps_validated": gps_result["validated"],
        "network_validated": network_result["validated"],
        "college_name": college_name,
        "city_name": city_name,
        "phase": phase_label,
        "locked": True,
    }), 200


@attendance_bp.route("/session-status/<int:session_id>", methods=["GET"])
@student_required
def get_session_status_for_student(session_id):
    """Check if student has already marked attendance for a session."""
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    student = user.student

    session = AttendanceSession.query.get(session_id)
    if not session:
        return jsonify({"error": "Session not found"}), 404

    sync_session_status(session)
    record = get_student_existing_record(session_id, student.id)
    phase = get_session_phase(session)

    return jsonify({
        "session": _session_dict(session),
        "phase": phase,
        "has_start": bool(record and record.start_marked_at),
        "has_end": bool(record and record.end_marked_at),
        "locked_start": bool(record and record.start_marked_at),
        "locked_end": bool(record and record.end_marked_at),
        "eligible_for_end": bool(record and record.start_marked_at and not record.end_marked_at),
        "record": record.to_dict() if record else None,
    }), 200


@attendance_bp.route("/live/<int:session_id>", methods=["GET"])
@jwt_required()
def get_live(session_id):
    """Get live attendance records for a session with filters."""
    session = AttendanceSession.query.get(session_id)
    if not session:
        return jsonify({"error": "Session not found"}), 404

    college = request.args.get("college", request.args.get("campus", "")).strip() or None
    city = request.args.get("city", "").strip() or None
    department = request.args.get("department", "").strip() or None
    section = request.args.get("section", "").strip() or None
    subject = request.args.get("subject", "").strip() or None

    include_absent = request.args.get("include_absent", "").lower() == "true" or session.status == "completed"
    results = get_live_results(session_id, college, city, department, section, subject, include_absent=include_absent)

    return jsonify({
        "session": _session_dict(session),
        "records": results,
    }), 200


@attendance_bp.route("/student/<int:student_id>", methods=["GET"])
@jwt_required()
def student_attendance(student_id):
    """Get attendance records for a specific student."""
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)

    if user.role == "student":
        if not user.student or user.student.id != student_id:
            return jsonify({"error": "Access denied"}), 403

    start_date = request.args.get("start_date")
    end_date = request.args.get("end_date")
    subject = request.args.get("subject")

    if start_date:
        start_date = datetime.strptime(start_date, "%Y-%m-%d").date()
    if end_date:
        end_date = datetime.strptime(end_date, "%Y-%m-%d").date()

    records = get_student_attendance(student_id, start_date, end_date, subject)
    stats = get_student_stats(student_id)

    return jsonify({
        "records": records,
        "stats": stats,
    }), 200


@attendance_bp.route("/dashboard", methods=["GET"])
@teacher_or_admin_required
def dashboard():
    """Get dashboard statistics with optional filters."""
    college = request.args.get("college", request.args.get("campus", "")).strip() or None
    city = request.args.get("city", "").strip() or None
    department = request.args.get("department", "").strip() or None
    section = request.args.get("section", "").strip() or None
    subject = request.args.get("subject", "").strip() or None

    stats = get_dashboard_stats(college, city, department, section, subject)
    return jsonify(stats), 200


@attendance_bp.route("/sessions", methods=["GET"])
@jwt_required()
def get_sessions():
    """List attendance sessions with optional filters."""
    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 20, type=int)
    status = request.args.get("status", "").strip()
    section = request.args.get("section", "").strip()
    college = request.args.get("college", request.args.get("campus", "")).strip()
    teacher_id = request.args.get("teacher_id", "", type=str).strip()

    query = AttendanceSession.query

    if status:
        query = query.filter_by(status=status)
    if section:
        query = query.filter_by(section=section)
    if college:
        query = query.filter_by(campus=college)
    if teacher_id:
        query = query.filter_by(teacher_id=int(teacher_id))

    query = query.order_by(AttendanceSession.session_date.desc(), AttendanceSession.start_time.desc())
    paginated = query.paginate(page=page, per_page=per_page, error_out=False)

    return jsonify({
        "sessions": [_session_dict(s) for s in paginated.items],
        "total": paginated.total,
        "pages": paginated.pages,
        "current_page": paginated.page,
    }), 200


@attendance_bp.route("/active-sessions", methods=["GET"])
@jwt_required()
def get_active_sessions():
    """Get sessions with open marking windows for students."""
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)

    sessions = AttendanceSession.query.filter(
        AttendanceSession.status.in_(["active", "end_verification"])
    ).order_by(AttendanceSession.start_time.desc()).all()

    if user.role == "student" and user.student:
        student = user.student

        def _matches(session_val, student_val):
            """Check if student_val matches session's multi-value field."""
            if not session_val:
                return True  # no filter = matches all
            if session_val == "ALL":
                return True
            vals = [v.strip() for v in session_val.split(",")]
            return student_val in vals

        sessions = [
            s for s in sessions
            if _matches(s.section, student.section)
            and _matches(s.department, student.department)
            and _matches(s.campus, student.college_name)
        ]

    open_sessions = []
    for s in sessions:
        sync_session_status(s)
        if is_marking_window_open(s):
            session_data = _session_dict(s)
            # Strip the actual access key from student-facing data
            if user.role == "student":
                session_data.pop("access_key", None)
                session_data["access_key_required"] = bool(s.access_key)
            if user.role == "student" and user.student:
                record = get_student_existing_record(s.id, user.student.id)
                phase = get_session_phase(s)
                session_data["student_status"] = {
                    "has_start": bool(record and record.start_marked_at),
                    "has_end": bool(record and record.end_marked_at),
                    "locked": (
                        (phase == "start_window" and record and record.start_marked_at)
                        or (phase == "end_window" and record and record.end_marked_at)
                    ),
                    "eligible_for_end": bool(
                        phase == "end_window" and record and record.start_marked_at and not record.end_marked_at
                    ),
                }
            open_sessions.append(session_data)

    return jsonify({"sessions": open_sessions}), 200


@attendance_bp.route("/colleges", methods=["GET"])
@jwt_required()
def get_colleges():
    """List distinct college names from students."""
    colleges = db.session.query(Student.college_name).distinct().all()
    return jsonify(sorted([c[0] for c in colleges if c[0]])), 200


@attendance_bp.route("/campuses", methods=["GET"])
@jwt_required()
def get_campuses():
    """Legacy alias for colleges list."""
    return get_colleges()


@attendance_bp.route("/cities", methods=["GET"])
@jwt_required()
def get_cities():
    """List distinct city names."""
    cities = db.session.query(Student.city_name).distinct().all()
    return jsonify(sorted({c[0] for c in cities if c[0]})), 200
