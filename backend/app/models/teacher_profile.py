"""Teacher profile model for extended teacher information."""

from datetime import datetime, timezone
from app.extensions import db


class TeacherProfile(db.Model):
    """Extended profile for teacher accounts, linked to a User."""

    __tablename__ = "teacher_profiles"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    teacher_id = db.Column(db.String(50), unique=True, nullable=True, index=True)
    gender = db.Column(db.String(20), nullable=True)
    department = db.Column(db.String(100), nullable=True)
    campus = db.Column(db.String(200), nullable=True)
    designation = db.Column(db.String(100), nullable=True)
    profile_image = db.Column(db.Text, nullable=True)
    profile_image_updated_at = db.Column(db.DateTime, nullable=True)

    # Relationship
    user = db.relationship(
        "User", backref=db.backref("teacher_profile", uselist=False, cascade="all, delete-orphan"),
    )

    def to_dict(self):
        """Serialize teacher profile to dictionary."""
        return {
            "id": self.id,
            "user_id": self.user_id,
            "teacher_id": self.teacher_id,
            "name": self.user.name if self.user else None,
            "email": self.user.email if self.user else None,
            "gender": self.gender,
            "department": self.department,
            "campus": self.campus,
            "designation": self.designation,
            "is_active": self.user.is_active if self.user else None,
            "profile_image": self.profile_image,
            "profile_image_updated_at": (
                self.profile_image_updated_at.isoformat()
                if self.profile_image_updated_at else None
            ),
            "created_at": (
                self.user.created_at.isoformat()
                if self.user and self.user.created_at else None
            ),
            "last_login": (
                self.user.last_login.isoformat()
                if self.user and self.user.last_login else None
            ),
        }
