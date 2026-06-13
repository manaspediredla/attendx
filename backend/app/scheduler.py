"""APScheduler jobs for automated tasks like attendance alerts."""

from apscheduler.schedulers.background import BackgroundScheduler

from app.extensions import db
from app.models.student import Student
from app.services.attendance_service import get_student_stats
from app.services.email_service import send_attendance_warning


def check_attendance_and_notify(app):
    """Check all students' attendance and send warnings if below 75%.

    Runs daily at 6:00 PM via APScheduler.
    Uses the new dual verification status types.
    """
    with app.app_context():
        students = Student.query.all()

        for student in students:
            stats = get_student_stats(student.id)

            if stats["total_classes"] == 0:
                continue

            if stats["percentage"] < 75.0:
                send_attendance_warning(student, stats)
                app.logger.info(
                    f"Attendance warning sent to {student.user.name} "
                    f"({stats['percentage']:.1f}% — "
                    f"{stats['present']}/{stats['total_classes']} classes)"
                )


def init_scheduler(app):
    """Initialize and start the APScheduler with all jobs."""
    scheduler = BackgroundScheduler()

    # Daily attendance check at 6:00 PM
    scheduler.add_job(
        func=check_attendance_and_notify,
        trigger="cron",
        hour=18,
        minute=0,
        args=[app],
        id="attendance_check",
        name="Daily Attendance Check",
        replace_existing=True,
    )

    scheduler.start()
    app.logger.info("APScheduler started — attendance check scheduled at 6:00 PM daily")

    return scheduler
