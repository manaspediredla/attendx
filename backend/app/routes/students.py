"""Student management routes — CRUD operations (teacher and admin)."""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
import bcrypt

from app.extensions import db
from app.models.user import User
from app.models.student import Student
from app.models.face_encoding import FaceEncoding
from app.utils.decorators import teacher_or_admin_required, super_admin_required
from app.utils.helpers import validate_email, validate_required_fields

students_bp = Blueprint("students", __name__, url_prefix="/api/students")


@students_bp.route("", methods=["GET"])
@teacher_or_admin_required
def get_students():
    """List all students with optional search and pagination."""
    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 20, type=int)
    search = request.args.get("search", "").strip()
    department = request.args.get("department", "").strip()
    college = request.args.get("college", "").strip()
    city = request.args.get("city", "").strip()
    section = request.args.get("section", "").strip()

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
    if college:
        query = query.filter(Student.college_name == college)
    if city:
        query = query.filter(Student.city_name == city)
    if section:
        query = query.filter(Student.section == section)

    query = query.order_by(Student.roll_number)
    paginated = query.paginate(page=page, per_page=per_page, error_out=False)

    return jsonify({
        "students": [s.to_dict() for s in paginated.items],
        "total": paginated.total,
        "pages": paginated.pages,
        "current_page": paginated.page,
    }), 200


@students_bp.route("/<int:student_id>", methods=["GET"])
@jwt_required()
def get_student(student_id):
    """Get a single student's details."""
    student = Student.query.get(student_id)
    if not student:
        return jsonify({"error": "Student not found"}), 404

    data = student.to_dict()
    data["encoding_count"] = FaceEncoding.query.filter_by(student_id=student_id).count()
    return jsonify(data), 200


@students_bp.route("", methods=["POST"])
@teacher_or_admin_required
def create_student():
    """Create a new student with user account."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body required"}), 400

    required = ["full_name", "email", "id", "department", "section", "college_name", "city_name", "gender"]
    missing = validate_required_fields(data, required)
    if missing:
        return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400

    email = data["email"].strip().lower()
    roll_number = data["id"].strip()
    full_name = data.get("full_name", data.get("name", "")).strip()

    if not validate_email(email):
        return jsonify({"error": "Invalid email format"}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({"error": "Email already exists"}), 409
    if Student.query.filter_by(roll_number=roll_number).first():
        return jsonify({"error": "Student ID already exists"}), 409

    from flask import current_app
    default_password = current_app.config.get("DEFAULT_STUDENT_PASSWORD", "Institution@123")
    hashed = bcrypt.hashpw(default_password.encode("utf-8"), bcrypt.gensalt())

    user = User(
        name=full_name,
        email=email,
        password_hash=hashed.decode("utf-8"),
        role="student",
        must_change_password=False,
    )
    db.session.add(user)
    db.session.flush()

    student = Student(
        user_id=user.id,
        roll_number=roll_number,
        department=data["department"].strip(),
        section=data["section"].strip(),
        gender=data["gender"].strip(),
        college_name=data["college_name"].strip(),
        city_name=data["city_name"].strip(),
        face_registration_status="pending",
    )
    db.session.add(student)
    db.session.commit()

    return jsonify({
        "message": "Student created successfully",
        "student": student.to_dict(),
        "default_password": default_password,
    }), 201


@students_bp.route("/<int:student_id>", methods=["PUT"])
@teacher_or_admin_required
def update_student(student_id):
    """Update student details."""
    student = Student.query.get(student_id)
    if not student:
        return jsonify({"error": "Student not found"}), 404

    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body required"}), 400

    user = student.user

    if "full_name" in data or "name" in data:
        user.name = (data.get("full_name") or data.get("name", "")).strip()
    if "email" in data:
        new_email = data["email"].strip().lower()
        if new_email != user.email:
            if not validate_email(new_email):
                return jsonify({"error": "Invalid email format"}), 400
            if User.query.filter_by(email=new_email).first():
                return jsonify({"error": "Email already exists"}), 409
            user.email = new_email

    if "id" in data:
        new_roll = data["id"].strip()
        if new_roll != student.roll_number:
            if Student.query.filter_by(roll_number=new_roll).first():
                return jsonify({"error": "Student ID already exists"}), 409
            student.roll_number = new_roll
    if "department" in data:
        student.department = data["department"].strip()
    if "section" in data:
        student.section = data["section"].strip()
    if "gender" in data:
        student.gender = data["gender"].strip()
    if "college_name" in data:
        student.college_name = data["college_name"].strip()
    if "city_name" in data:
        student.city_name = data["city_name"].strip()

    db.session.commit()

    return jsonify({
        "message": "Student updated successfully",
        "student": student.to_dict(),
    }), 200


@students_bp.route("/<int:student_id>", methods=["DELETE"])
@super_admin_required
def delete_student(student_id):
    """Delete a student and their associated user account and data."""
    student = Student.query.get(student_id)
    if not student:
        return jsonify({"error": "Student not found"}), 404

    user = student.user
    db.session.delete(student)
    if user:
        db.session.delete(user)
    db.session.commit()

    return jsonify({"message": "Student deleted successfully"}), 200


@students_bp.route("/departments", methods=["GET"])
@jwt_required()
def get_departments():
    """Get list of all unique departments."""
    departments = db.session.query(Student.department).distinct().all()
    return jsonify([d[0] for d in departments]), 200


@students_bp.route("/sections", methods=["GET"])
@jwt_required()
def get_sections():
    """Get list of all unique sections."""
    sections = db.session.query(Student.section).distinct().all()
    return jsonify([s[0] for s in sections]), 200
