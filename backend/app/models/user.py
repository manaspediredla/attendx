"""User model for authentication and role management."""

from datetime import datetime, timezone
from app.extensions import db


class User(db.Model):
    """User account for super_admin, teacher, and student authentication."""

    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(
        db.Enum("super_admin", "teacher", "student", name="user_role"),
        nullable=False,
        default="student",
    )
    must_change_password = db.Column(db.Boolean, default=False, nullable=False)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    last_login = db.Column(db.DateTime, nullable=True)
    created_by = db.Column(
        db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at = db.Column(
        db.DateTime, default=lambda: datetime.now(timezone.utc)
    )

    # Relationships
    student = db.relationship(
        "Student", backref="user", uselist=False, cascade="all, delete-orphan",
        foreign_keys="Student.user_id",
    )
    creator = db.relationship("User", remote_side=[id], foreign_keys=[created_by])

    def to_dict(self):
        """Serialize user to dictionary."""
        return {
            "id": self.id,
            "name": self.name,
            "email": self.email,
            "role": self.role,
            "must_change_password": self.must_change_password,
            "is_active": self.is_active,
            "last_login": self.last_login.isoformat() if self.last_login else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
