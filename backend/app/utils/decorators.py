"""Utility decorators for role-based access control."""

from functools import wraps
from flask import jsonify, request
from flask_jwt_extended import get_jwt_identity, verify_jwt_in_request

from app.models.user import User
from app.models.system_setting import SystemSetting
from app.utils.request_helpers import get_client_ip, normalize_ip


def super_admin_required(fn):
    """Decorator that ensures the current user is a super_admin.

    Also validates IP whitelist if configured.
    """

    @wraps(fn)
    def wrapper(*args, **kwargs):
        verify_jwt_in_request()
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        if not user or user.role != "super_admin":
            return jsonify({"error": "Super Admin access required"}), 403
        if not user.is_active:
            return jsonify({"error": "Account is disabled"}), 403

        # IP whitelist check for super admin
        whitelisted = SystemSetting.get_value("super_admin_whitelisted_ips", "")
        if whitelisted:
            allowed_ips = [normalize_ip(ip) for ip in whitelisted.split(",") if ip.strip()]
            allowed_ips = [ip for ip in allowed_ips if ip]
            client_ip = get_client_ip(request)
            if client_ip and allowed_ips and client_ip not in allowed_ips:
                return jsonify({"error": "Access denied from this IP address"}), 403

        return fn(*args, **kwargs)

    return wrapper


def teacher_required(fn):
    """Decorator that ensures the current user is a teacher."""

    @wraps(fn)
    def wrapper(*args, **kwargs):
        verify_jwt_in_request()
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        if not user or user.role != "teacher":
            return jsonify({"error": "Teacher access required"}), 403
        if not user.is_active:
            return jsonify({"error": "Account is disabled"}), 403
        return fn(*args, **kwargs)

    return wrapper


def teacher_or_admin_required(fn):
    """Decorator that ensures the current user is a teacher or super_admin."""

    @wraps(fn)
    def wrapper(*args, **kwargs):
        verify_jwt_in_request()
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        if not user or user.role not in ("teacher", "super_admin"):
            return jsonify({"error": "Teacher or Admin access required"}), 403
        if not user.is_active:
            return jsonify({"error": "Account is disabled"}), 403
        return fn(*args, **kwargs)

    return wrapper


def student_required(fn):
    """Decorator that ensures the current user is a student."""

    @wraps(fn)
    def wrapper(*args, **kwargs):
        verify_jwt_in_request()
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        if not user or user.role != "student":
            return jsonify({"error": "Student access required"}), 403
        if not user.is_active:
            return jsonify({"error": "Account is disabled"}), 403
        return fn(*args, **kwargs)

    return wrapper


def any_authenticated(fn):
    """Decorator that ensures the user is authenticated (any role)."""

    @wraps(fn)
    def wrapper(*args, **kwargs):
        verify_jwt_in_request()
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        if not user:
            return jsonify({"error": "Authentication required"}), 401
        if not user.is_active:
            return jsonify({"error": "Account is disabled"}), 403
        return fn(*args, **kwargs)

    return wrapper


def log_audit(action, details=None):
    """Helper to create an audit log entry from within a request context."""
    from app.models.audit_log import AuditLog
    from app.extensions import db

    user_id = None
    try:
        verify_jwt_in_request(optional=True)
        identity = get_jwt_identity()
        if identity:
            user_id = int(identity)
    except Exception:
        pass

    log = AuditLog(
        user_id=user_id,
        action=action,
        details=details,
        ip_address=request.headers.get("X-Forwarded-For", request.remote_addr),
        user_agent=request.headers.get("User-Agent", "")[:500],
    )
    db.session.add(log)
    db.session.commit()
