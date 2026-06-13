"""Attendance session model for tracking class sessions."""

from datetime import datetime, timezone
from app.extensions import db


class AttendanceSession(db.Model):
    """Represents a single attendance-taking session for a class.

    Supports dual verification with separate start and end windows.
    """

    __tablename__ = "attendance_sessions"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    teacher_id = db.Column(
        db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    subject = db.Column(db.String(100), nullable=False)
    section = db.Column(db.String(10), nullable=False)
    department = db.Column(db.String(100), nullable=True)
    campus = db.Column(db.String(200), nullable=True)
    year = db.Column(db.Integer, nullable=True)
    session_date = db.Column(
        db.Date, nullable=False, default=lambda: datetime.now(timezone.utc).date()
    )

    # Start verification window
    start_time = db.Column(
        db.DateTime, default=lambda: datetime.now(timezone.utc)
    )
    attendance_window_start = db.Column(db.DateTime, nullable=True)
    attendance_window_end = db.Column(db.DateTime, nullable=True)

    # End verification window
    end_time = db.Column(db.DateTime, nullable=True)
    end_verification_start = db.Column(db.DateTime, nullable=True)
    end_verification_end = db.Column(db.DateTime, nullable=True)

    grace_period_minutes = db.Column(db.Integer, default=0)
    access_key = db.Column(db.String(50), nullable=True)

    status = db.Column(
        db.Enum("active", "end_verification", "completed", name="session_status"),
        nullable=False,
        default="active",
    )

    # Relationships
    teacher = db.relationship("User", backref="sessions", foreign_keys=[teacher_id])
    records = db.relationship(
        "AttendanceRecord", backref="session", cascade="all, delete-orphan"
    )

    def to_dict(self):
        """Serialize session to dictionary."""
        full_count = 0
        partial_count = 0
        suspicious_count = 0
        absent_count = 0

        if self.records:
            for r in self.records:
                if r.status == "full":
                    full_count += 1
                elif r.status == "partial":
                    partial_count += 1
                elif r.status == "suspicious":
                    suspicious_count += 1
                elif r.status == "absent":
                    absent_count += 1

        return {
            "id": self.id,
            "teacher_id": self.teacher_id,
            "teacher_name": self.teacher.name if self.teacher else None,
            "subject": self.subject,
            "section": self.section,
            "college": self.campus,
            "campus": self.campus,
            "department": self.department,
            "session_date": self.session_date.isoformat() if self.session_date else None,
            "start_time": self.start_time.isoformat() if self.start_time else None,
            "attendance_window_start": self.attendance_window_start.isoformat() if self.attendance_window_start else None,
            "attendance_window_end": self.attendance_window_end.isoformat() if self.attendance_window_end else None,
            "end_time": self.end_time.isoformat() if self.end_time else None,
            "end_verification_start": self.end_verification_start.isoformat() if self.end_verification_start else None,
            "end_verification_end": self.end_verification_end.isoformat() if self.end_verification_end else None,
            "grace_period_minutes": self.grace_period_minutes,
            "access_key": self.access_key,
            "status": self.status,
            "full_count": full_count,
            "partial_count": partial_count,
            "suspicious_count": suspicious_count,
            "absent_count": absent_count,
            "total_count": len(self.records) if self.records else 0,
        }
