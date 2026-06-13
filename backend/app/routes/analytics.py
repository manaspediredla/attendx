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
