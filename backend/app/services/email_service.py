"""Email service for sending attendance alerts and custom notifications."""

from flask import current_app
from flask_mail import Message

from app.extensions import mail, db
from app.models.notification import Notification


def send_attendance_warning(student, stats):
    """Send detailed attendance shortage warning email to a student.

    Args:
        student: Student model instance.
        stats: Attendance statistics dict from get_student_stats().
    """
    if not student.user or not student.user.email:
        return False

    percentage = stats["percentage"]
    total_classes = stats["total_classes"]
    present = stats["present"]
    absent = stats["absent"]

    try:
        subject = "⚠️ Attendance Shortage Warning"
        body = f"""Dear {student.user.name},

Your current attendance percentage is below the required minimum threshold of 75%.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Student Name:          {student.user.name}
Student ID:            {student.roll_number}
College:               {student.college_name or 'N/A'}
City:                  {student.city_name or 'N/A'}
Department:            {student.department}
Section:               {student.section}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Current Attendance:    {percentage:.1f}%
Required Minimum:      75%
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Classes Attended:      {present}
Total Classes:         {total_classes}
Classes Missed:        {absent}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Please attend upcoming classes regularly to avoid academic penalties.
If you believe this is an error, please contact your department administrator.

Regards,
Smart AI Attendance Management System
"""

        msg = Message(
            subject=subject,
            recipients=[student.user.email],
            body=body,
        )
        mail.send(msg)

        # Store notification in database
        notification = Notification(
            student_id=student.id,
            message=(
                f"Attendance warning: Your attendance is {percentage:.1f}%, "
                f"below the 75% threshold. "
                f"({present}/{total_classes} classes attended)"
            ),
            type="attendance_warning",
        )
        db.session.add(notification)
        db.session.commit()

        return True

    except Exception as e:
        current_app.logger.error(f"Failed to send email to {student.user.email}: {e}")
        # Still store the notification even if email fails
        notification = Notification(
            student_id=student.id,
            message=(
                f"Attendance warning: Your attendance is {percentage:.1f}%, "
                f"below the 75% threshold. (Email delivery failed)"
            ),
            type="attendance_warning",
        )
        db.session.add(notification)
        db.session.commit()
        return False


def send_custom_email(student, subject, body):
    """Send a custom email from admin/teacher to a student.

    Args:
        student: Student model instance.
        subject: Email subject string.
        body: Email body string.
    """
    if not student.user or not student.user.email:
        return False

    try:
        msg = Message(
            subject=subject,
            recipients=[student.user.email],
            body=body,
        )
        mail.send(msg)

        notification = Notification(
            student_id=student.id,
            message=f"Email: {subject} - {body[:200]}",
            type="custom",
        )
        db.session.add(notification)
        db.session.commit()
        return True

    except Exception as e:
        current_app.logger.error(f"Failed to send custom email: {e}")
        return False
