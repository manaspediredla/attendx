"""Teacher routes — student list (read-only), sessions, profile, filter helpers."""

from datetime import datetime, timezone

from flask import Blueprint, request, jsonify
from flask_jwt_extended import get_jwt_identity, jwt_required

from app.extensions import db
from app.models.user import User
from app.models.student import Student
from app.models.teacher_profile import TeacherProfile
from app.models.attendance_session import AttendanceSession
from app.utils.decorators import teacher_required, teacher_or_admin_required, log_audit

teacher_bp = Blueprint("teacher", __name__, url_prefix="/api/teacher")


# ── Student List (read-only) ───────────────────────────────────────

@teacher_bp.route("/students", methods=["GET"])
@teacher_or_admin_required
def get_students():
    """List students with optional filters (read-only for teachers)."""
    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 20, type=int)
    search = request.args.get("search", "").strip()
    department = request.args.get("department", "").strip()
    section = request.args.get("section", "").strip()
    face_status = request.args.get("face_status", "").strip()
    college = request.args.get("college", "").strip()
    city = request.args.get("city", "").strip()

    query = Student.query.join(User, Student.user_id == User.id)

    if search:
        query = query.filter(
            db.or_(
                User.name.ilike(f"%{search}%"),
                Student.roll_number.ilike(f"%{search}%"),
                User.email.ilike(f"%{search}%"),
            )
        )
    if department:
        query = query.filter(Student.department == department)
    if section:
        query = query.filter(Student.section == section)
    if face_status:
        query = query.filter(Student.face_registration_status == face_status)
    if college:
        query = query.filter(Student.college_name == college)
    if city:
        query = query.filter(Student.city_name == city)

    query = query.order_by(Student.roll_number)
    paginated = query.paginate(page=page, per_page=per_page, error_out=False)

    return jsonify({
        "students": [s.to_dict() for s in paginated.items],
        "total": paginated.total,
        "pages": paginated.pages,
        "current_page": paginated.page,
    }), 200


# ── Teacher Sessions (own sessions only) ───────────────────────────

@teacher_bp.route("/sessions", methods=["GET"])
@teacher_required
def get_teacher_sessions():
    """Get attendance sessions for the current teacher only."""
    user_id = int(get_jwt_identity())

    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 20, type=int)
    status = request.args.get("status", "").strip()

    query = AttendanceSession.query.filter_by(teacher_id=user_id)

    if status:
        query = query.filter_by(status=status)

    query = query.order_by(AttendanceSession.session_date.desc())
    paginated = query.paginate(page=page, per_page=per_page, error_out=False)

    return jsonify({
        "sessions": [s.to_dict() for s in paginated.items],
        "total": paginated.total,
        "pages": paginated.pages,
        "current_page": paginated.page,
    }), 200


# ── Teacher Profile ────────────────────────────────────────────────

@teacher_bp.route("/profile", methods=["GET"])
@teacher_required
def get_profile():
    """Get the current teacher's profile."""
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    profile = TeacherProfile.query.filter_by(user_id=user_id).first()

    data = user.to_dict()
    if profile:
        data.update(profile.to_dict())
    else:
        data.update({
            "teacher_id": None, "gender": None, "department": None,
            "campus": None, "designation": None, "profile_image": None,
        })

    return jsonify(data), 200


@teacher_bp.route("/profile", methods=["PUT"])
@teacher_required
def update_profile():
    """Update the current teacher's profile."""
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body required"}), 400

    # Update user name if provided
    if "name" in data:
        user.name = data["name"].strip()

    # Get or create teacher profile
    profile = TeacherProfile.query.filter_by(user_id=user_id).first()
    if not profile:
        profile = TeacherProfile(user_id=user_id)
        db.session.add(profile)

    # Update profile fields
    if "department" in data:
        profile.department = data["department"].strip() or None
    if "designation" in data:
        profile.designation = data["designation"].strip() or None
    if "campus" in data:
        profile.campus = data["campus"].strip() or None
    if "gender" in data:
        profile.gender = data["gender"].strip() or None
    if "profile_image" in data:
        profile.profile_image = data["profile_image"]
        profile.profile_image_updated_at = datetime.now(timezone.utc)

    db.session.commit()
    log_audit("teacher_profile_updated", f"Teacher {user.email} updated their profile")

    return jsonify({
        "message": "Profile updated successfully",
        "profile": profile.to_dict(),
    }), 200


# ── Departments / Sections / Colleges / Cities ─────────────────────

@teacher_bp.route("/departments", methods=["GET"])
@teacher_or_admin_required
def get_departments():
    """Get list of all unique departments."""
    departments = db.session.query(Student.department).distinct().all()
    return jsonify([d[0] for d in departments if d[0]]), 200


@teacher_bp.route("/sections", methods=["GET"])
@teacher_or_admin_required
def get_sections():
    """Get list of all unique sections."""
    sections = db.session.query(Student.section).distinct().all()
    return jsonify([s[0] for s in sections if s[0]]), 200


@teacher_bp.route("/colleges", methods=["GET"])
@teacher_or_admin_required
def get_colleges():
    """Get list of all unique colleges."""
    colleges = db.session.query(Student.college_name).distinct().all()
    return jsonify(sorted([c[0] for c in colleges if c[0]])), 200


@teacher_bp.route("/campuses", methods=["GET"])
@teacher_or_admin_required
def get_campuses():
    """Legacy alias for colleges list."""
    return get_colleges()


@teacher_bp.route("/cities", methods=["GET"])
@teacher_or_admin_required
def get_cities():
    """Get list of all unique cities."""
    cities = db.session.query(Student.city_name).distinct().all()
    return jsonify(sorted([c[0] for c in cities if c[0]])), 200
