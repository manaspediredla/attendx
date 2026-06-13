"""Entry point for the Flask application."""

import os

import bcrypt
from dotenv import load_dotenv

load_dotenv()

from app import create_app
from app.extensions import db
from app.models.user import User
from app.models.system_setting import SystemSetting
from app.scheduler import init_scheduler


def seed_super_admin():
    """Create default super admin account if none exists."""
    admin = User.query.filter_by(role="super_admin").first()
    if not admin:
        hashed = bcrypt.hashpw("SuperAdmin@123".encode("utf-8"), bcrypt.gensalt())
        admin = User(
            name="Super Administrator",
            email="admin@attendance.com",
            password_hash=hashed.decode("utf-8"),
            role="super_admin",
            must_change_password=False,
            is_active=True,
        )
        db.session.add(admin)
        db.session.commit()
        print("✅ Default super admin created: admin@attendance.com / SuperAdmin@123")
    else:
        print("ℹ️  Super admin account already exists")


def seed_default_settings():
    """Initialize default system settings if they don't exist."""
    defaults = {
        "institution_name": ("ATTENDX", "Name of the educational institution"),
        "default_student_password": (os.getenv("DEFAULT_STUDENT_PASSWORD", "Institution@123"), "Default password for new student accounts"),
        "default_teacher_password": (os.getenv("DEFAULT_TEACHER_PASSWORD", "Faculty@123"), "Default password for new teacher accounts"),
        "attendance_min_percentage": (os.getenv("ATTENDANCE_MIN_PERCENTAGE", "75.0"), "Minimum required attendance percentage"),
        "super_admin_whitelisted_ips": (os.getenv("SUPER_ADMIN_WHITELISTED_IPS", "127.0.0.1,::1"), "Comma-separated IPs allowed for super admin login"),
        "face_min_images": (os.getenv("FACE_MIN_IMAGES", "20"), "Minimum face images for registration"),
        "face_recommended_images": (os.getenv("FACE_RECOMMENDED_IMAGES", "30"), "Recommended face images for registration"),
    }

    for key, (value, description) in defaults.items():
        existing = SystemSetting.query.filter_by(key=key).first()
        if not existing:
            setting = SystemSetting(key=key, value=value, description=description)
            db.session.add(setting)

    db.session.commit()
    print("✅ Default system settings initialized")


app = create_app()

with app.app_context():
    seed_super_admin()
    seed_default_settings()

# Initialize scheduler (only in main process, not reloader)
if not os.environ.get("WERKZEUG_RUN_MAIN") or os.environ.get("WERKZEUG_RUN_MAIN") == "true":
    init_scheduler(app)

if __name__ == "__main__":
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "5001"))
    debug = os.getenv("FLASK_DEBUG", "1") == "1"

    print(f"🚀 Starting ATTENDX on {host}:{port}")
    app.run(host=host, port=port, debug=debug)
