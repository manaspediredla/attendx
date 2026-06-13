"""Teacher CSV import service — parse and import teacher data from CSV files."""

import csv
import io

import bcrypt
from flask import current_app

from app.extensions import db
from app.models.user import User
from app.models.teacher_profile import TeacherProfile
from app.utils.helpers import validate_email


TEACHER_REQUIRED_FIELDS = ["full_name", "email"]
TEACHER_HEADER_ALIASES = {
    "teacher_id": "teacher_id",
    "tid": "teacher_id",
    "id": "teacher_id",
    "full_name": "full_name",
    "name": "full_name",
    "teacher_name": "full_name",
    "email": "email",
    "email_address": "email",
    "gender": "gender",
    "sex": "gender",
    "department": "department",
    "dept": "department",
    "campus": "campus",
    "college": "campus",
    "college_name": "campus",
    "designation": "designation",
    "title": "designation",
}


def normalize_teacher_headers(headers):
    """Normalize CSV headers to canonical field names."""
    normalized = []
    for h in headers:
        clean = h.strip().lower()
        normalized.append(TEACHER_HEADER_ALIASES.get(clean, clean))
    return normalized


def import_teachers(file_content, filename, admin_id):
    """Import teacher records from CSV content."""
    try:
        reader = csv.DictReader(io.StringIO(file_content))
        if not reader.fieldnames:
            return {"success": False, "errors": ["CSV file is empty or has no headers"]}

        headers = normalize_teacher_headers(reader.fieldnames)
        reader.fieldnames = headers

        missing_headers = [h for h in TEACHER_REQUIRED_FIELDS if h not in headers]
        if missing_headers:
            return {
                "success": False,
                "errors": [
                    f"Missing required columns: {', '.join(missing_headers)}. "
                    f"Required: {', '.join(TEACHER_REQUIRED_FIELDS)}"
                ],
            }

        rows = list(reader)
        if not rows:
            return {"success": False, "errors": ["CSV file contains no data rows"]}

    except Exception as e:
        return {"success": False, "errors": [f"Failed to parse CSV: {str(e)}"]}

    default_password = current_app.config.get("DEFAULT_TEACHER_PASSWORD", "Teacher@123")
    hashed_password = bcrypt.hashpw(
        default_password.encode("utf-8"), bcrypt.gensalt()
    ).decode("utf-8")

    success_count = 0
    duplicate_count = 0
    failed_count = 0
    errors = []

    for i, row in enumerate(rows, start=2):
        try:
            full_name = row.get("full_name", "").strip()
            email = row.get("email", "").strip().lower()
            teacher_id_str = row.get("teacher_id", "").strip()
            gender = row.get("gender", "").strip()
            department = row.get("department", "").strip()
            campus = row.get("campus", "").strip()
            designation = row.get("designation", "").strip()

            if not full_name or not email:
                errors.append({"row": i, "error": "Missing name or email"})
                failed_count += 1
                continue

            if not validate_email(email):
                errors.append({"row": i, "error": f"Invalid email: {email}"})
                failed_count += 1
                continue

            if User.query.filter_by(email=email).first():
                duplicate_count += 1
                continue

            if teacher_id_str and TeacherProfile.query.filter_by(teacher_id=teacher_id_str).first():
                duplicate_count += 1
                continue

            db.session.begin_nested()

            user = User(
                name=full_name,
                email=email,
                password_hash=hashed_password,
                role="teacher",
                must_change_password=True,
                created_by=admin_id,
            )
            db.session.add(user)
            db.session.flush()

            profile = TeacherProfile(
                user_id=user.id,
                teacher_id=teacher_id_str or None,
                gender=gender or None,
                department=department or None,
                campus=campus or None,
                designation=designation or None,
            )
            db.session.add(profile)
            db.session.flush()

            success_count += 1

        except Exception as e:
            db.session.rollback()
            errors.append({"row": i, "error": str(e)})
            failed_count += 1

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return {"success": False, "errors": [{"row": 0, "error": "Database commit failed"}]}

    return {
        "success": True,
        "total_records": len(rows),
        "success_count": success_count,
        "duplicate_count": duplicate_count,
        "failed_count": failed_count,
        "errors": errors,
        "default_password": default_password,
    }
