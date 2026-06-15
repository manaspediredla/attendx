"""Predictive Attendance Analytics — risk forecasting for students.

Provides linear-trend projections that predict whether each student
will fall below the 75 % attendance threshold by semester end.
"""

from collections import defaultdict
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from app.extensions import db
from app.models.attendance_session import AttendanceSession
from app.models.attendance_record import AttendanceRecord
from app.models.student import Student
from app.models.user import User
from app.utils.decorators import teacher_required

analytics_bp = Blueprint("analytics", __name__, url_prefix="/api/teacher/analytics")


# ── Helpers ────────────────────────────────────────────────────────

def _risk_level(pct):
    """Classify attendance percentage into a risk tier."""
    if pct < 60:
        return "critical"
    if pct < 70:
        return "high"
    if pct < 75:
        return "medium"
    return "safe"


RISK_ORDER = {"critical": 0, "high": 1, "medium": 2, "safe": 3}


def _trend_direction(recent_pct, overall_pct):
    """Return trend label comparing recent window to overall average."""
    diff = recent_pct - overall_pct
    if diff > 5:
        return "improving"
    if diff < -5:
        return "declining"
    return "stable"


def _compute_streak(statuses):
    """Compute the current consecutive streak (present or absent).

    *statuses* is a list of booleans ordered oldest → newest.
    Returns (streak_count, streak_type).
    """
    if not statuses:
        return 0, "none"

    current = statuses[-1]
    streak = 0
    for s in reversed(statuses):
        if s == current:
            streak += 1
        else:
            break
    return streak, ("present" if current else "absent")


# ── Main endpoint ─────────────────────────────────────────────────

@analytics_bp.route("/predictions", methods=["GET"])
@teacher_required
def get_predictions():
    """Return per-student attendance predictions for the current teacher.

    Query params (all optional):
        department – filter by student department
        section    – filter by student section
        subject    – filter by session subject
    """
    teacher_id = int(get_jwt_identity())

    # Optional filters
    department = request.args.get("department", "").strip()
    section = request.args.get("section", "").strip()
    subject = request.args.get("subject", "").strip()

    # ── 1. Fetch completed sessions for this teacher ──────────────
    session_q = AttendanceSession.query.filter(
        AttendanceSession.teacher_id == teacher_id,
        AttendanceSession.status == "completed",
    )
    if subject:
        session_q = session_q.filter(AttendanceSession.subject == subject)

    sessions = session_q.order_by(AttendanceSession.session_date.asc()).all()

    if not sessions:
        return jsonify({
            "predictions": [],
            "summary": {"critical": 0, "high": 0, "medium": 0, "safe": 0, "total": 0},
            "total_sessions": 0,
        }), 200

    session_ids = [s.id for s in sessions]
    total_sessions = len(session_ids)

    # ── 2. Fetch all attendance records in one query ──────────────
    records = (
        AttendanceRecord.query
        .filter(AttendanceRecord.session_id.in_(session_ids))
        .all()
    )

    # Build session_index lookup (for ordering)
    session_index = {sid: i for i, sid in enumerate(session_ids)}

    # Group records by student
    student_records = defaultdict(list)
    for rec in records:
        student_records[rec.student_id].append(rec)

    # ── 3. Fetch student details ──────────────────────────────────
    student_ids = list(student_records.keys())

    # Also include students who have zero records (absent from ALL sessions)
    # by checking which students appear in sessions' target groups
    all_students_q = Student.query.join(User, Student.user_id == User.id)
    if department:
        all_students_q = all_students_q.filter(Student.department == department)
    if section:
        all_students_q = all_students_q.filter(Student.section == section)

    all_students = all_students_q.all()
    student_map = {s.id: s for s in all_students}

    # Merge: ensure every student from our filter set is in student_records
    for s in all_students:
        if s.id not in student_records:
            student_records[s.id] = []

    # ── 4. Compute predictions per student ────────────────────────
    predictions = []
    summary = {"critical": 0, "high": 0, "medium": 0, "safe": 0}

    for sid, recs in student_records.items():
        student = student_map.get(sid)
        if not student:
            continue

        # Apply filters
        if department and student.department != department:
            continue
        if section and student.section != section:
            continue

        # Presence bitmap (ordered by session date)
        recs_sorted = sorted(recs, key=lambda r: session_index.get(r.session_id, 0))
        presence = [
            r.status in ("full", "partial", "present_start", "present_end")
            for r in recs_sorted
        ]

        # Pad with False for sessions where student had no record (absent)
        attended_session_ids = {r.session_id for r in recs_sorted}
        full_presence = []
        for s_id in session_ids:
            if s_id in attended_session_ids:
                rec = next(r for r in recs_sorted if r.session_id == s_id)
                full_presence.append(
                    rec.status in ("full", "partial", "present_start", "present_end")
                )
            else:
                full_presence.append(False)

        total = len(full_presence)
        attended = sum(full_presence)
        current_pct = round((attended / total) * 100, 1) if total else 0

        # Recent window (last 5 sessions)
        recent_window = 5
        recent = full_presence[-recent_window:] if len(full_presence) >= recent_window else full_presence
        recent_pct = round((sum(recent) / len(recent)) * 100, 1) if recent else 0

        # Trend
        trend = _trend_direction(recent_pct, current_pct)

        # ── Linear prediction ─────────────────────────────────────
        # Simple: if current trend continues, what will final % be?
        # Assume ~20 sessions per semester as default projection
        projected_total = max(total, 20)
        remaining = projected_total - total

        if remaining > 0 and len(recent) >= 2:
            # recent rate projects forward
            recent_rate = sum(recent) / len(recent)
            projected_attended = attended + (recent_rate * remaining)
            predicted_pct = round((projected_attended / projected_total) * 100, 1)
        else:
            predicted_pct = current_pct

        predicted_pct = max(0, min(100, predicted_pct))

        # Risk level based on PREDICTED percentage
        risk = _risk_level(predicted_pct)
        summary[risk] += 1

        # How many more can they miss and stay >= 75%?
        needed_for_75 = int(0.75 * projected_total)
        can_miss = max(0, (projected_total - needed_for_75) - (total - attended))

        # Streak
        streak_count, streak_type = _compute_streak(full_presence)

        predictions.append({
            "student_id": student.roll_number,
            "internal_id": student.id,
            "name": student.user.name if student.user else "Unknown",
            "department": student.department,
            "section": student.section,
            "year": student.year,
            "college": student.college_name,
            "current_pct": current_pct,
            "predicted_pct": predicted_pct,
            "trend": trend,
            "risk_level": risk,
            "sessions_attended": attended,
            "total_sessions": total,
            "can_miss_more": can_miss,
            "streak_count": streak_count,
            "streak_type": streak_type,
            "recent_pct": recent_pct,
        })

    # Sort: critical first, then high, medium, safe
    predictions.sort(key=lambda p: (RISK_ORDER.get(p["risk_level"], 99), p["current_pct"]))

    summary["total"] = len(predictions)

    return jsonify({
        "predictions": predictions,
        "summary": summary,
        "total_sessions": total_sessions,
    }), 200


@analytics_bp.route("/subjects", methods=["GET"])
@teacher_required
def get_teacher_subjects():
    """Return unique subjects for this teacher's completed sessions."""
    teacher_id = int(get_jwt_identity())
    subjects = (
        db.session.query(AttendanceSession.subject)
        .filter(
            AttendanceSession.teacher_id == teacher_id,
            AttendanceSession.status == "completed",
        )
        .distinct()
        .all()
    )
    return jsonify([s[0] for s in subjects if s[0]]), 200


# ── Risk-specific email templates ─────────────────────────────────

RISK_EMAIL = {
    "critical": {
        "subject": "🚨 Critical Attendance Alert — Immediate Action Required",
        "intro": "Your attendance has fallen to a critically low level and requires immediate action.",
        "action": "You are at serious risk of academic penalties. Please attend ALL upcoming classes without exception.",
    },
    "high": {
        "subject": "⚠️ Attendance Warning — High Risk",
        "intro": "Your attendance is dangerously low and approaching the critical zone.",
        "action": "Please prioritize attending classes regularly to avoid falling into the critical category.",
    },
    "medium": {
        "subject": "📋 Attendance Reminder — Approaching Minimum Threshold",
        "intro": "Your attendance is approaching the minimum required threshold of 75%.",
        "action": "Please maintain regular attendance to stay above the requirement. A few more absences could put you at high risk.",
    },
}


@analytics_bp.route("/send-warnings", methods=["POST"])
@teacher_required
def send_warnings():
    """Send attendance warning emails + in-app notifications to at-risk students.

    Body JSON (all optional):
        subject      – filter by session subject
        risk_levels  – list of risk tiers to warn (default: critical, high, medium)
        student_ids  – specific internal student IDs to warn (overrides risk filter)
    """
    from app.models.notification import Notification

    teacher_id = int(get_jwt_identity())
    teacher = User.query.get(teacher_id)
    data = request.get_json() or {}

    subject_filter = data.get("subject", "").strip()
    risk_levels = data.get("risk_levels", ["critical", "high", "medium"])
    specific_ids = data.get("student_ids")  # optional: specific students

    # ── 1. Get this teacher's completed sessions ──────────────────
    session_q = AttendanceSession.query.filter(
        AttendanceSession.teacher_id == teacher_id,
        AttendanceSession.status == "completed",
    )
    if subject_filter:
        session_q = session_q.filter(AttendanceSession.subject == subject_filter)

    sessions = session_q.order_by(AttendanceSession.session_date.asc()).all()
    if not sessions:
        return jsonify({"error": "No completed sessions found"}), 400

    session_ids = [s.id for s in sessions]
    total_sessions = len(session_ids)

    # ── 2. Compute per-student attendance ─────────────────────────
    records = AttendanceRecord.query.filter(
        AttendanceRecord.session_id.in_(session_ids)
    ).all()

    student_records = defaultdict(list)
    for rec in records:
        student_records[rec.student_id].append(rec)

    # Also include students with zero records
    all_students = Student.query.join(User, Student.user_id == User.id).all()
    student_map = {s.id: s for s in all_students}
    for s in all_students:
        if s.id not in student_records:
            student_records[s.id] = []

    # ── 3. Identify at-risk students and send warnings ────────────
    notifications_created = 0
    students_warned = []

    for sid, recs in student_records.items():
        student = student_map.get(sid)
        if not student or not student.user:
            continue

        # If specific IDs provided, only warn those
        if specific_ids and student.id not in specific_ids:
            continue

        # Calculate attendance
        attended_sessions = {r.session_id for r in recs
                            if r.status in ("full", "partial", "present_start", "present_end")}
        attended = len(attended_sessions)
        current_pct = round((attended / total_sessions) * 100, 1) if total_sessions else 0
        absent = total_sessions - attended

        risk = _risk_level(current_pct)

        # Skip safe students and those not in requested risk levels
        if risk not in risk_levels:
            continue

        # How many more can they miss?
        projected_total = max(total_sessions, 20)
        needed_for_75 = int(0.75 * projected_total)
        can_miss = max(0, (projected_total - needed_for_75) - absent)

        email_cfg = RISK_EMAIL.get(risk, RISK_EMAIL["medium"])
        teacher_name = teacher.name if teacher else "Your Teacher"

        # ── Create notification ───────────────────────────────────
        notif_msg = (
            f"{'🚨' if risk == 'critical' else '⚠️' if risk == 'high' else '📋'} "
            f"Attendance {email_cfg['subject'].split('—')[0].strip().split('—')[0].strip()}: "
            f"Your attendance is {current_pct}% ({attended}/{total_sessions} classes). "
            f"{'You cannot miss any more classes!' if can_miss == 0 else f'You can miss {can_miss} more class(es) before falling below 75%.'} "
            f"— Sent by {teacher_name}"
        )

        notification = Notification(
            student_id=student.id,
            message=notif_msg,
            type="attendance_warning",
        )
        db.session.add(notification)
        notifications_created += 1

        students_warned.append({
            "name": student.user.name,
            "roll_number": student.roll_number,
            "risk_level": risk,
            "percentage": current_pct,
        })

    db.session.commit()

    return jsonify({
        "message": f"Notifications sent to {len(students_warned)} students",
        "notifications_created": notifications_created,
        "students_warned": students_warned,
    }), 200

