"""Notification routes."""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import get_jwt_identity, jwt_required

from app.extensions import db
from app.models.user import User
from app.models.student import Student
from app.models.notification import Notification
from app.services.email_service import send_custom_email
from app.utils.decorators import teacher_or_admin_required

notifications_bp = Blueprint("notifications", __name__, url_prefix="/api/notifications")


@notifications_bp.route("", methods=["GET"])
@jwt_required()
def get_notifications():
    """Get notifications for the current user."""
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)

    if user.role in ("super_admin", "teacher"):
        # Admin and teacher see all notifications
        page = request.args.get("page", 1, type=int)
        per_page = request.args.get("per_page", 20, type=int)
        query = Notification.query.order_by(Notification.created_at.desc())
        paginated = query.paginate(page=page, per_page=per_page, error_out=False)
        return jsonify({
            "notifications": [n.to_dict() for n in paginated.items],
            "total": paginated.total,
            "pages": paginated.pages,
            "unread_count": Notification.query.filter_by(is_read=False).count(),
        }), 200
    else:
        # Student sees only their own
        if not user.student:
            return jsonify({"notifications": [], "total": 0}), 200

        notifications = Notification.query.filter_by(
            student_id=user.student.id
        ).order_by(Notification.created_at.desc()).all()

        unread = sum(1 for n in notifications if not n.is_read)
        return jsonify({
            "notifications": [n.to_dict() for n in notifications],
            "total": len(notifications),
            "unread_count": unread,
        }), 200


@notifications_bp.route("/send", methods=["POST"])
@teacher_or_admin_required
def send_notification():
    """Send a custom notification/email from teacher/admin to student(s)."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body required"}), 400

    student_ids = data.get("student_ids", [])
    subject = data.get("subject", "Notification from Admin")
    message = data.get("message", "")
    send_email = data.get("send_email", False)

    if not message:
        return jsonify({"error": "Message is required"}), 400

    if not student_ids:
        students = Student.query.all()
    else:
        students = Student.query.filter(Student.id.in_(student_ids)).all()

    sent_count = 0
    for student in students:
        notification = Notification(
            student_id=student.id,
            message=message,
            type="custom",
        )
        db.session.add(notification)

        if send_email:
            send_custom_email(student, subject, message)

        sent_count += 1

    db.session.commit()

    return jsonify({
        "message": f"Notification sent to {sent_count} students",
        "sent_count": sent_count,
    }), 200


@notifications_bp.route("/<int:notification_id>/read", methods=["PUT"])
@jwt_required()
def mark_as_read(notification_id):
    """Mark a notification as read."""
    notification = Notification.query.get(notification_id)
    if not notification:
        return jsonify({"error": "Notification not found"}), 404

    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if user.role == "student" and user.student:
        if notification.student_id != user.student.id:
            return jsonify({"error": "Access denied"}), 403

    notification.is_read = True
    db.session.commit()

    return jsonify({"message": "Marked as read"}), 200


@notifications_bp.route("/mark-all-read", methods=["PUT"])
@jwt_required()
def mark_all_read():
    """Mark all notifications as read for the current user."""
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)

    if user.role == "student" and user.student:
        Notification.query.filter_by(
            student_id=user.student.id, is_read=False
        ).update({"is_read": True})
    elif user.role in ("super_admin", "teacher"):
        Notification.query.filter_by(is_read=False).update({"is_read": True})

    db.session.commit()
    return jsonify({"message": "All notifications marked as read"}), 200
