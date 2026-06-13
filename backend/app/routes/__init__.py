"""Routes package init — exposes all blueprint imports."""

from app.routes.auth import auth_bp
from app.routes.admin import admin_bp
from app.routes.teacher import teacher_bp
from app.routes.students import students_bp
from app.routes.faces import faces_bp
from app.routes.attendance import attendance_bp
from app.routes.reports import reports_bp
from app.routes.notifications import notifications_bp
from app.routes.analytics import analytics_bp

__all__ = [
    "auth_bp",
    "admin_bp",
    "teacher_bp",
    "students_bp",
    "faces_bp",
    "attendance_bp",
    "reports_bp",
    "notifications_bp",
    "analytics_bp",
]
