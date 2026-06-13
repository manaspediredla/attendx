"""Flask application factory."""

import os

from flask import Flask

from app.config import config_by_name
from app.extensions import db, jwt, mail, cors


def create_app(config_name=None):
    """Create and configure the Flask application.

    Args:
        config_name: 'development' or 'production'. Defaults to FLASK_ENV.

    Returns:
        Configured Flask application instance.
    """
    if config_name is None:
        config_name = os.getenv("FLASK_ENV", "development")

    app = Flask(__name__)
    app.config.from_object(config_by_name[config_name])

    # Initialize extensions
    db.init_app(app)
    jwt.init_app(app)
    mail.init_app(app)
    cors.init_app(app, resources={r"/api/*": {"origins": "*"}})

    # Register blueprints
    from app.routes.auth import auth_bp
    from app.routes.admin import admin_bp
    from app.routes.teacher import teacher_bp
    from app.routes.students import students_bp
    from app.routes.faces import faces_bp
    from app.routes.attendance import attendance_bp
    from app.routes.reports import reports_bp
    from app.routes.notifications import notifications_bp
    from app.routes.analytics import analytics_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(teacher_bp)
    app.register_blueprint(students_bp)
    app.register_blueprint(faces_bp)
    app.register_blueprint(attendance_bp)
    app.register_blueprint(reports_bp)
    app.register_blueprint(notifications_bp)
    app.register_blueprint(analytics_bp)

    # Create database tables
    with app.app_context():
        from app.models import (
            User, Student, FaceEncoding,
            AttendanceSession, AttendanceRecord, Notification,
            AllowedLocation, AllowedNetwork, AuditLog,
            SystemSetting, CSVImport,
        )
        db.create_all()
        from app.migrate import run_migrations
        run_migrations()

    # Health check endpoint
    @app.route("/api/health", methods=["GET"])
    def health_check():
        return {"status": "healthy", "service": "ATTENDX"}, 200

    return app
