"""CSV service — parse and import student data from CSV files."""

import csv
import io

import bcrypt
from flask import current_app

from app.utils.csv_mapping import HEADER_ALIASES, REQUIRED_FIELDS
from app.extensions import db
from app.models.user import User
from app.models.student import Student
from app.models.csv_import import CSVImport
from app.utils.helpers import validate_email


def normalize_headers(headers):
    """Normalize CSV headers to canonical field names using csv_mapping config."""
    normalized = []
    for h in headers:
        clean = h.strip().lower()
        normalized.append(HEADER_ALIASES.get(clean, clean))
    return normalized


def validate_csv_structure(file_content):
    """Validate CSV file structure and return parsed rows."""
    try:
        reader = csv.DictReader(io.StringIO(file_content))
        if not reader.fieldnames:
            return None, None, ["CSV file is empty or has no headers"]

        headers = normalize_headers(reader.fieldnames)
        reader.fieldnames = headers

        missing_headers = [h for h in REQUIRED_FIELDS if h not in headers]
        if missing_headers:
            return None, None, [
                f"Missing required columns: {', '.join(missing_headers)}. "
                f"Required: {', '.join(REQUIRED_FIELDS)}"
            ]

        rows = list(reader)
        if not rows:
            return headers, [], ["CSV file contains no data rows"]

        return headers, rows, []

    except Exception as e:
        return None, None, [f"Failed to parse CSV: {str(e)}"]


def import_students(file_content, filename, teacher_id):
    """Import student records from CSV content."""
    headers, rows, parse_errors = validate_csv_structure(file_content)

    if parse_errors:
        import_record = CSVImport(
            teacher_id=teacher_id,
            filename=filename,
            total_records=0,
            status="failed",
            error_details={"parse_errors": parse_errors},
        )
        db.session.add(import_record)
        db.session.commit()
        return {
            "success": False,
            "import_id": import_record.id,
            "errors": parse_errors,
        }

    default_password = current_app.config.get("DEFAULT_STUDENT_PASSWORD", "Institution@123")
    hashed_password = bcrypt.hashpw(
        default_password.encode("utf-8"), bcrypt.gensalt()
    ).decode("utf-8")

    success_count = 0
    duplicate_count = 0
    failed_count = 0
    errors = []
    imported_students = []

    for i, row in enumerate(rows, start=2):
        try:
            roll_number = row.get("id", "").strip()
            full_name = row.get("full_name", "").strip()
            email = row.get("email", "").strip().lower()
            gender = row.get("gender", "").strip()
            department = row.get("department", "").strip()
            section = row.get("section", "").strip()
            college_name = row.get("college_name", "").strip()
            city_name = row.get("city_name", "").strip()
            year_str = row.get("year", "").strip()
            year = int(year_str) if year_str else 1

            if not all([
                roll_number, full_name, email, gender, department, section,
                college_name, city_name,
            ]):
                errors.append({
                    "row": i,
                    "error": "Missing required fields",
                    "data": row,
                })
                failed_count += 1
                continue

            if not validate_email(email):
                errors.append({
                    "row": i,
                    "error": f"Invalid email format: {email}",
                    "data": row,
                })
                failed_count += 1
                continue

            if User.query.filter_by(email=email).first():
                duplicate_count += 1
                continue

            if Student.query.filter_by(roll_number=roll_number).first():
                duplicate_count += 1
                continue

            # Use a savepoint so a single row failure doesn't corrupt the
            # whole session and cause subsequent rows / the final commit to
            # fail with an "inactive transaction" error.
            db.session.begin_nested()

            user = User(
                name=full_name,
                email=email,
                password_hash=hashed_password,
                role="student",
                must_change_password=False,
                created_by=teacher_id,
            )
            db.session.add(user)
            db.session.flush()

            student = Student(
                user_id=user.id,
                roll_number=roll_number,
                department=department,
                section=section,
                year=year,
                gender=gender,
                college_name=college_name,
                city_name=city_name,
                face_registration_status="pending",
                face_registered=False,
                first_login_completed=False,
                registered_by=teacher_id,
            )
            db.session.add(student)
            db.session.flush()

            imported_students.append(student.to_dict())
            success_count += 1

        except Exception as e:
            db.session.rollback()  # rolls back to the savepoint
            errors.append({
                "row": i,
                "error": str(e),
                "data": row,
            })
            failed_count += 1

    try:
        import_record = CSVImport(
            teacher_id=teacher_id,
            filename=filename,
            total_records=len(rows),
            success_count=success_count,
            duplicate_count=duplicate_count,
            failed_count=failed_count,
            status="completed",
            error_details={"errors": errors} if errors else None,
        )
        db.session.add(import_record)
        db.session.commit()
    except Exception:
        db.session.rollback()
        # Re-try the import record alone after rolling back
        import_record = CSVImport(
            teacher_id=teacher_id,
            filename=filename,
            total_records=len(rows),
            success_count=0,
            duplicate_count=0,
            failed_count=len(rows),
            status="failed",
            error_details={"errors": [{"row": 0, "error": "Database commit failed after processing rows"}]},
        )
        db.session.add(import_record)
        db.session.commit()

    return {
        "success": True,
        "import_id": import_record.id,
        "total_records": len(rows),
        "success_count": success_count,
        "duplicate_count": duplicate_count,
        "failed_count": failed_count,
        "errors": errors,
        "imported_students": imported_students,
        "required_fields": REQUIRED_FIELDS,
    }
