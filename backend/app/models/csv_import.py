"""CSV import model for tracking student import history."""

from datetime import datetime, timezone
from app.extensions import db


class CSVImport(db.Model):
    """Tracks CSV import operations for student data."""

    __tablename__ = "csv_imports"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    teacher_id = db.Column(
        db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    filename = db.Column(db.String(255), nullable=False)
    total_records = db.Column(db.Integer, default=0)
    success_count = db.Column(db.Integer, default=0)
    duplicate_count = db.Column(db.Integer, default=0)
    failed_count = db.Column(db.Integer, default=0)
    status = db.Column(
        db.Enum("processing", "completed", "failed", name="import_status"),
        nullable=False,
        default="processing",
    )
    error_details = db.Column(db.JSON, nullable=True)
    created_at = db.Column(
        db.DateTime, default=lambda: datetime.now(timezone.utc)
    )

    # Relationships
    teacher = db.relationship("User", backref="csv_imports")

    def to_dict(self):
        """Serialize import record to dictionary."""
        return {
            "id": self.id,
            "teacher_id": self.teacher_id,
            "teacher_name": self.teacher.name if self.teacher else None,
            "filename": self.filename,
            "total_records": self.total_records,
            "success_count": self.success_count,
            "duplicate_count": self.duplicate_count,
            "failed_count": self.failed_count,
            "status": self.status,
            "error_details": self.error_details,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
