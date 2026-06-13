"""Attendance record model for individual student attendance entries."""

from datetime import datetime, timezone
from app.extensions import db


class AttendanceRecord(db.Model):
    """Individual attendance entry linking a student to a session.

    Supports dual verification with start/end face checks and
    GPS/network validation data.
    """

    __tablename__ = "attendance_records"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    session_id = db.Column(
        db.Integer,
        db.ForeignKey("attendance_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    student_id = db.Column(
        db.Integer,
        db.ForeignKey("students.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Dual verification status
    status = db.Column(
        db.Enum("present_start", "present_end", "full", "partial", "suspicious", "absent",
                name="attendance_status"),
        nullable=False,
        default="absent",
    )

    # Start verification
    start_marked_at = db.Column(db.DateTime, nullable=True)
    start_confidence = db.Column(db.Float, nullable=True)

    # End verification
    end_marked_at = db.Column(db.DateTime, nullable=True)
    end_confidence = db.Column(db.Float, nullable=True)

    # GPS validation
    gps_latitude = db.Column(db.Float, nullable=True)
    gps_longitude = db.Column(db.Float, nullable=True)
    gps_validated = db.Column(db.Boolean, default=False)
    campus_name = db.Column(db.String(200), nullable=True)
    city_name = db.Column(db.String(100), nullable=True)

    # Network validation
    network_validated = db.Column(db.Boolean, default=False)
    client_ip = db.Column(db.String(45), nullable=True)

    # Dual verification status breakdown
    start_attendance_status = db.Column(db.String(30), nullable=True)
    end_attendance_status = db.Column(db.String(30), nullable=True)
    final_attendance_status = db.Column(db.String(30), nullable=True)

    # Unique constraint: one record per student per session
    __table_args__ = (
        db.UniqueConstraint("session_id", "student_id", name="uq_session_student"),
    )

    def to_dict(self):
        """Serialize record to dictionary."""
        return {
            "record_id": self.id,
            "session_id": self.session_id,
            "student_id": self.student_id,
            "student_name": self.student.user.name if self.student and self.student.user else None,
            "id": self.student.roll_number if self.student else None,
            "roll_number": self.student.roll_number if self.student else None,
            "status": self.status,
            "start_marked_at": self.start_marked_at.isoformat() if self.start_marked_at else None,
            "start_confidence": round(self.start_confidence, 4) if self.start_confidence else None,
            "end_marked_at": self.end_marked_at.isoformat() if self.end_marked_at else None,
            "end_confidence": round(self.end_confidence, 4) if self.end_confidence else None,
            "gps_validated": self.gps_validated,
            "gps_latitude": self.gps_latitude,
            "gps_longitude": self.gps_longitude,
            "college_name": self.campus_name or (self.student.college_name if self.student else None),
            "campus_name": self.campus_name,
            "city_name": self.city_name,
            "network_validated": self.network_validated,
            "client_ip": self.client_ip,
            "start_attendance_status": self.start_attendance_status,
            "end_attendance_status": self.end_attendance_status,
            "final_attendance_status": self.final_attendance_status or self.status,
        }
