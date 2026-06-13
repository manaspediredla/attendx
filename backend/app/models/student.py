"""Student model for student profile information."""

from datetime import datetime, timezone

from app.extensions import db


class Student(db.Model):
    """Student profile linked to a user account."""

    __tablename__ = "students"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    roll_number = db.Column(db.String(20), unique=True, nullable=False, index=True)
    department = db.Column(db.String(100), nullable=False)
    section = db.Column(db.String(10), nullable=False)
    year = db.Column(db.Integer, nullable=False, default=1)
    gender = db.Column(db.String(20), nullable=True)
    college_name = db.Column(db.String(200), nullable=True)
    city_name = db.Column(db.String(100), nullable=True)
    face_registration_status = db.Column(
        db.Enum("pending", "registered", "failed", name="face_reg_status"),
        nullable=False,
        default="pending",
    )
    face_registered = db.Column(db.Boolean, nullable=False, default=False)
    first_login_completed = db.Column(db.Boolean, nullable=False, default=False)
    profile_image = db.Column(db.Text, nullable=True)
    profile_image_updated_at = db.Column(db.DateTime, nullable=True)
    registered_by = db.Column(
        db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    # Relationships
    face_encodings = db.relationship(
        "FaceEncoding", backref="student", cascade="all, delete-orphan"
    )
    attendance_records = db.relationship(
        "AttendanceRecord", backref="student", cascade="all, delete-orphan"
    )
    notifications = db.relationship(
        "Notification", backref="student", cascade="all, delete-orphan"
    )
    registrar = db.relationship(
        "User", foreign_keys=[registered_by], backref="imported_students"
    )

    @classmethod
    def find_by_roll(cls, roll_number):
        """Look up a student by roll number (business identifier)."""
        return cls.query.filter_by(roll_number=roll_number).first()

    def to_dict(self):
        """Serialize student to dictionary using V4 field names."""
        return {
            "id": self.roll_number,
            "internal_id": self.id,
            "full_name": self.user.name if self.user else None,
            "name": self.user.name if self.user else None,
            "email": self.user.email if self.user else None,
            "gender": self.gender,
            "college_name": self.college_name,
            "city_name": self.city_name,
            "department": self.department,
            "section": self.section,
            "year": self.year,
            "face_registration_status": self.face_registration_status,
            "face_registered": self.face_registered,
            "first_login_completed": self.first_login_completed,
            "created_at": (
                self.user.created_at.isoformat()
                if self.user and self.user.created_at
                else None
            ),
            "has_face_data": len(self.face_encodings) > 0 if self.face_encodings else False,
            "encoding_count": len(self.face_encodings) if self.face_encodings else 0,
            "profile_image": self.profile_image,
            "profile_image_updated_at": (
                self.profile_image_updated_at.isoformat()
                if self.profile_image_updated_at else None
            ),
        }
