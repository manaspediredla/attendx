"""Face encoding model for storing 128-dimensional face vectors."""

from datetime import datetime, timezone
from app.extensions import db


class FaceEncoding(db.Model):
    """Stores 128-dim face encoding vectors for face recognition matching."""

    __tablename__ = "face_encodings"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    student_id = db.Column(
        db.Integer,
        db.ForeignKey("students.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    encoding_data = db.Column(db.LargeBinary, nullable=False)
    created_at = db.Column(
        db.DateTime, default=lambda: datetime.now(timezone.utc)
    )

    def to_dict(self):
        """Serialize face encoding metadata (excludes binary data)."""
        return {
            "id": self.id,
            "student_id": self.student_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
