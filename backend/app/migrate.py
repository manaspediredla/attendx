"""Lightweight schema migrations for existing databases (no Alembic)."""

from sqlalchemy import inspect, text

from app.extensions import db
from app.models.face_encoding import FaceEncoding
from app.models.student import Student


def _column_exists(table, column):
    inspector = inspect(db.engine)
    cols = [c["name"] for c in inspector.get_columns(table)]
    return column in cols


def _add_column_if_missing(table, column, ddl):
    if not _column_exists(table, column):
        db.session.execute(text(f"ALTER TABLE {table} ADD COLUMN {ddl}"))
        db.session.commit()


def run_migrations():
    """Apply additive schema changes idempotently."""
    # Students — V4 schema
    _add_column_if_missing("students", "gender", "gender VARCHAR(20) NULL")
    _add_column_if_missing("students", "college_name", "college_name VARCHAR(200) NULL")
    _add_column_if_missing("students", "city_name", "city_name VARCHAR(100) NULL")
    _add_column_if_missing("students", "face_registered", "face_registered TINYINT(1) NOT NULL DEFAULT 0")
    _add_column_if_missing("students", "first_login_completed", "first_login_completed TINYINT(1) NOT NULL DEFAULT 0")

    # Migrate legacy campus_name data into college_name
    if _column_exists("students", "campus_name") and _column_exists("students", "college_name"):
        db.session.execute(text(
            "UPDATE students SET college_name = campus_name "
            "WHERE college_name IS NULL AND campus_name IS NOT NULL"
        ))
        db.session.commit()

    # Attendance sessions
    _add_column_if_missing("attendance_sessions", "campus", "campus VARCHAR(200) NULL")

    # Attendance records
    _add_column_if_missing("attendance_records", "campus_name", "campus_name VARCHAR(200) NULL")
    _add_column_if_missing("attendance_records", "city_name", "city_name VARCHAR(100) NULL")
    _add_column_if_missing("attendance_records", "start_attendance_status", "start_attendance_status VARCHAR(30) NULL")
    _add_column_if_missing("attendance_records", "end_attendance_status", "end_attendance_status VARCHAR(30) NULL")
    _add_column_if_missing("attendance_records", "final_attendance_status", "final_attendance_status VARCHAR(30) NULL")

    # Allowed locations
    _add_column_if_missing("allowed_locations", "city_name", "city_name VARCHAR(100) NULL")

    # Session access key (Phase 2 — access key feature)
    _add_column_if_missing("attendance_sessions", "access_key", "access_key VARCHAR(50) NULL")

    # Teacher profiles table (Phase 6 — enhanced teacher management)
    _create_teacher_profiles_table()

    # Student profile image
    _add_column_if_missing("students", "profile_image", "profile_image TEXT NULL")
    _add_column_if_missing("students", "profile_image_updated_at", "profile_image_updated_at DATETIME NULL")


def _table_exists(table):
    inspector = inspect(db.engine)
    return table in inspector.get_table_names()


def _create_teacher_profiles_table():
    """Create teacher_profiles table if it doesn't exist."""
    if _table_exists("teacher_profiles"):
        return
    db.session.execute(text("""
        CREATE TABLE teacher_profiles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL UNIQUE,
            teacher_id VARCHAR(50) UNIQUE,
            gender VARCHAR(20),
            department VARCHAR(100),
            campus VARCHAR(200),
            designation VARCHAR(100),
            profile_image TEXT,
            profile_image_updated_at DATETIME,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """))
    db.session.commit()


def reset_student_face_data():
    """Clear all stored face encodings and require students to enroll on next login."""
    encoding_count = FaceEncoding.query.delete()
    students = Student.query.all()
    for student in students:
        student.face_registration_status = "pending"
        student.face_registered = False
    db.session.commit()
    return encoding_count, len(students)
