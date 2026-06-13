"""Models package — import all models so SQLAlchemy registers them."""

from app.models.user import User
from app.models.student import Student
from app.models.face_encoding import FaceEncoding
from app.models.attendance_session import AttendanceSession
from app.models.attendance_record import AttendanceRecord
from app.models.notification import Notification
from app.models.allowed_location import AllowedLocation
from app.models.allowed_network import AllowedNetwork
from app.models.audit_log import AuditLog
from app.models.system_setting import SystemSetting
from app.models.csv_import import CSVImport
from app.models.teacher_profile import TeacherProfile

__all__ = [
    "User",
    "Student",
    "FaceEncoding",
    "AttendanceSession",
    "AttendanceRecord",
    "Notification",
    "AllowedLocation",
    "AllowedNetwork",
    "AuditLog",
    "SystemSetting",
    "CSVImport",
    "TeacherProfile",
]
