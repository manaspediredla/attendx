"""Attendance service — session management, dual verification, and attendance logic."""

from datetime import datetime, timezone, date, timedelta

from app.extensions import db
from app.models.attendance_session import AttendanceSession
from app.models.attendance_record import AttendanceRecord
from app.models.student import Student

# IST timezone (UTC+5:30) — all times in this app are IST
IST = timezone(timedelta(hours=5, minutes=30))


def now_ist():
    """Get current time in IST."""
    return datetime.now(IST)


def _as_ist(dt):
    """Normalize DB datetimes for comparison with IST now."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=IST)
    return dt.astimezone(IST)


def get_session_phase(session, now=None):
    """Return the current phase of a session based on configured time windows."""
    now = now or now_ist()

    if session.status == "completed":
        return "completed"

    start = _as_ist(session.attendance_window_start)
    start_end = _as_ist(session.attendance_window_end)
    end_start = _as_ist(session.end_verification_start)
    end_end = _as_ist(session.end_verification_end)

    if start and now < start:
        return "scheduled"
    if start and start_end and start <= now <= start_end:
        return "start_window"
    if end_start and end_end and end_start <= now <= end_end:
        return "end_window"
    if start_end and end_start and start_end < now < end_start:
        return "class_in_progress"
    if end_end and now > end_end:
        return "completed"
    if session.status == "end_verification":
        return "end_window"
    if session.status == "active":
        return "start_window" if is_marking_window_open(session, now) else "class_in_progress"
    return "class_in_progress"


def sync_session_status(session, now=None):
    """Auto-transition session status based on current time."""
    now = now or now_ist()
    phase = get_session_phase(session, now)

    if phase == "start_window" and session.status != "active":
        session.status = "active"
    elif phase == "class_in_progress" and session.status == "active":
        session.status = "active"
    elif phase == "end_window" and session.status != "end_verification":
        session.status = "end_verification"
    elif phase == "completed" and session.status != "completed":
        end_session(session.id, auto=True)
        return session

    db.session.commit()
    return session


def is_marking_window_open(session, now=None):
    """Return True if students can still mark attendance for the current phase."""
    now = now or now_ist()
    phase = get_session_phase(session, now)
    grace = timedelta(minutes=session.grace_period_minutes or 0)

    if phase == "start_window":
        window_end = _as_ist(session.attendance_window_end)
        return not window_end or now <= window_end + grace

    if phase == "end_window":
        window_end = _as_ist(session.end_verification_end)
        return not window_end or now <= window_end + grace

    return False


def parse_session_datetime(session_date, time_str):
    """Combine session date and HH:MM time string into IST datetime.

    Teachers enter times in IST. We store them as IST.
    """
    if not time_str:
        return None
    parts = time_str.strip().split(":")
    hour = int(parts[0])
    minute = int(parts[1]) if len(parts) > 1 else 0
    dt = datetime.combine(session_date, datetime.min.time().replace(hour=hour, minute=minute))
    return dt  # stored as naive datetime, treated as IST


def start_session(teacher_id, subject, section, department=None, college=None,
                  session_date=None, class_start_time=None, attendance_monitoring_end=None,
                  meeting_end_time=None, end_verification_start=None, end_verification_end=None,
                  window_start=None, window_end=None, grace_period=0, access_key=None):
    """Create a new attendance session with scheduled time windows (all times in IST)."""
    now = now_ist()
    session_date = session_date or now.date()

    if class_start_time:
        attendance_window_start = parse_session_datetime(session_date, class_start_time)
        attendance_window_end = parse_session_datetime(session_date, attendance_monitoring_end)
        meeting_end = parse_session_datetime(session_date, meeting_end_time)
        end_ver_start = parse_session_datetime(session_date, end_verification_start)
        end_ver_end = parse_session_datetime(session_date, end_verification_end)
    else:
        attendance_window_start = window_start or now.replace(tzinfo=None)
        attendance_window_end = window_end
        meeting_end = None
        end_ver_start = None
        end_ver_end = None

    initial_status = "active"
    if attendance_window_start and now > _as_ist(attendance_window_start):
        initial_status = "active"

    session = AttendanceSession(
        teacher_id=teacher_id,
        subject=subject,
        section=section,
        department=department,
        campus=college,
        session_date=session_date,
        start_time=attendance_window_start or now.replace(tzinfo=None),
        attendance_window_start=attendance_window_start,
        attendance_window_end=attendance_window_end,
        end_time=meeting_end,
        end_verification_start=end_ver_start,
        end_verification_end=end_ver_end,
        grace_period_minutes=grace_period,
        access_key=access_key,
        status=initial_status,
    )
    db.session.add(session)
    db.session.commit()
    sync_session_status(session)
    return session


def start_end_verification(session_id, window_start=None, window_end=None):
    """Transition a session to end verification phase (manual override)."""
    session = AttendanceSession.query.get(session_id)
    if not session:
        return None, "Session not found"
    if session.status == "completed":
        return None, "Session already completed"

    now = now_ist()
    session.status = "end_verification"
    session.end_verification_start = window_start or session.end_verification_start or now.replace(tzinfo=None)
    session.end_verification_end = window_end or session.end_verification_end

    db.session.commit()
    return session, None


def _finalize_record_status(record):
    """Compute final attendance status from start/end marks."""
    has_start = record.start_marked_at is not None
    has_end = record.end_marked_at is not None

    record.start_attendance_status = "present_start" if has_start else "absent"
    record.end_attendance_status = "present_end" if has_end else "absent"

    if has_start and has_end:
        record.status = "full"
        record.final_attendance_status = "full"
    elif has_start and not has_end:
        record.status = "partial"
        record.final_attendance_status = "partial"
    elif not has_start and has_end:
        record.status = "suspicious"
        record.final_attendance_status = "suspicious"
    else:
        record.status = "absent"
        record.final_attendance_status = "absent"


def end_session(session_id, auto=False):
    """End an attendance session and finalize all statuses."""
    session = AttendanceSession.query.get(session_id)
    if not session:
        return None, "Session not found"
    if session.status == "completed":
        return None, "Session already completed"

    session.end_time = session.end_time or now_ist().replace(tzinfo=None)
    session.status = "completed"

    # Find all students that match the session's section/dept/campus (supports multi-value and ALL)
    def _val_matches(session_val, student_val):
        if not session_val or session_val == "ALL":
            return True
        vals = [v.strip() for v in session_val.split(",")]
        return student_val in vals

    # Get students from all matching sections
    if session.section and session.section != "ALL":
        section_vals = [v.strip() for v in session.section.split(",")]
        section_students = Student.query.filter(Student.section.in_(section_vals)).all()
    else:
        section_students = Student.query.all()

    section_students = [s for s in section_students if _val_matches(session.department, s.department)]
    section_students = [s for s in section_students if _val_matches(session.campus, s.college_name)]

    existing_records = {
        r.student_id: r
        for r in AttendanceRecord.query.filter_by(session_id=session_id).all()
    }

    for student in section_students:
        record = existing_records.get(student.id)

        if record:
            _finalize_record_status(record)
        else:
            absent_record = AttendanceRecord(
                session_id=session_id,
                student_id=student.id,
                status="absent",
                start_attendance_status="absent",
                end_attendance_status="absent",
                final_attendance_status="absent",
            )
            db.session.add(absent_record)

    db.session.commit()
    return session, None


def mark_start(session_id, student_id, confidence, gps_lat=None, gps_lng=None,
               gps_validated=False, network_validated=False, client_ip=None,
               campus_name=None, city_name=None):
    """Mark a student's start-session attendance. Locks after first successful mark."""
    session = AttendanceSession.query.get(session_id)
    if not session:
        return None, "Session not found"

    sync_session_status(session)
    if get_session_phase(session) != "start_window":
        return None, "Attendance window closed"

    now = now_ist()
    window_end = _as_ist(session.attendance_window_end)
    if window_end:
        grace = timedelta(minutes=session.grace_period_minutes or 0)
        if now > window_end + grace:
            return None, "Attendance window closed"

    existing = AttendanceRecord.query.filter_by(
        session_id=session_id, student_id=student_id
    ).first()

    if existing and existing.start_marked_at:
        return existing, "Attendance Already Recorded"

    if existing:
        existing.start_marked_at = now.replace(tzinfo=None)
        existing.start_confidence = confidence
        existing.gps_latitude = gps_lat
        existing.gps_longitude = gps_lng
        existing.gps_validated = gps_validated
        existing.network_validated = network_validated
        existing.client_ip = client_ip
        existing.campus_name = campus_name
        existing.city_name = city_name
        existing.status = "present_start"
        existing.start_attendance_status = "present_start"
        db.session.commit()
        return existing, None

    record = AttendanceRecord(
        session_id=session_id,
        student_id=student_id,
        status="present_start",
        start_attendance_status="present_start",
        start_marked_at=now.replace(tzinfo=None),
        start_confidence=confidence,
        gps_latitude=gps_lat,
        gps_longitude=gps_lng,
        gps_validated=gps_validated,
        network_validated=network_validated,
        client_ip=client_ip,
        campus_name=campus_name,
        city_name=city_name,
    )
    db.session.add(record)
    db.session.commit()
    return record, None


def mark_end(session_id, student_id, confidence, gps_lat=None, gps_lng=None,
             gps_validated=False, network_validated=False, client_ip=None,
             campus_name=None, city_name=None):
    """Mark end verification — only students who marked start are eligible."""
    session = AttendanceSession.query.get(session_id)
    if not session:
        return None, "Session not found"

    sync_session_status(session)
    if get_session_phase(session) != "end_window":
        return None, "End verification window closed"

    now = now_ist()
    window_end = _as_ist(session.end_verification_end)
    if window_end:
        grace = timedelta(minutes=session.grace_period_minutes or 0)
        if now > window_end + grace:
            return None, "End verification window closed"

    existing = AttendanceRecord.query.filter_by(
        session_id=session_id, student_id=student_id
    ).first()

    if not existing or not existing.start_marked_at:
        return None, "Not eligible — you did not mark attendance at the start of class"

    if existing.end_marked_at:
        return existing, "Attendance Already Recorded"

    existing.end_marked_at = now.replace(tzinfo=None)
    existing.end_confidence = confidence
    existing.status = "present_end"
    existing.end_attendance_status = "present_end"
    if gps_lat is not None:
        existing.gps_latitude = gps_lat
        existing.gps_longitude = gps_lng
        existing.gps_validated = gps_validated
        existing.network_validated = network_validated
        existing.client_ip = client_ip
        existing.campus_name = campus_name or existing.campus_name
        existing.city_name = city_name or existing.city_name
    db.session.commit()
    return existing, None


def get_student_existing_record(session_id, student_id):
    """Get a student's record for a session if it exists."""
    return AttendanceRecord.query.filter_by(
        session_id=session_id, student_id=student_id
    ).first()


def get_live_results(session_id, college=None, city=None, department=None, section=None, subject=None, include_absent=False):
    """Get current records for a session with optional filters."""
    query = AttendanceRecord.query.filter(
        AttendanceRecord.session_id == session_id,
    ).join(Student)

    if not include_absent:
        query = query.filter(AttendanceRecord.status != "absent")

    if college:
        query = query.filter(Student.college_name == college)
    if city:
        query = query.filter(Student.city_name == city)
    if department:
        query = query.filter(Student.department == department)
    if section:
        query = query.filter(Student.section == section)

    records = query.all()
    return [r.to_dict() for r in records]


def get_student_attendance(student_id, start_date=None, end_date=None, subject=None):
    """Get attendance records for a specific student with optional filters."""
    query = (
        db.session.query(AttendanceRecord)
        .join(AttendanceSession)
        .filter(AttendanceRecord.student_id == student_id)
    )

    if start_date:
        query = query.filter(AttendanceSession.session_date >= start_date)
    if end_date:
        query = query.filter(AttendanceSession.session_date <= end_date)
    if subject:
        query = query.filter(AttendanceSession.subject == subject)

    query = query.order_by(AttendanceSession.session_date.desc())
    records = query.all()

    return [r.to_dict() for r in records]


def get_student_stats(student_id):
    """Calculate attendance statistics for a student."""
    records = AttendanceRecord.query.filter_by(student_id=student_id).all()
    total = len(records)
    full = sum(1 for r in records if (r.final_attendance_status or r.status) == "full")
    partial = sum(1 for r in records if (r.final_attendance_status or r.status) == "partial")
    suspicious = sum(1 for r in records if (r.final_attendance_status or r.status) == "suspicious")
    absent = sum(1 for r in records if (r.final_attendance_status or r.status) == "absent")

    # Weighted calculation: full = 1.0, partial = 0.5, absent/suspicious = 0
    weighted_present = full + (partial * 0.5)
    percentage = round((weighted_present / total) * 100, 2) if total > 0 else 0.0

    subject_stats = {}
    for record in records:
        session = record.session
        subj = session.subject if session else "Unknown"
        if subj not in subject_stats:
            subject_stats[subj] = {"total": 0, "full": 0, "partial": 0, "suspicious": 0, "absent": 0}
        subject_stats[subj]["total"] += 1
        status = record.final_attendance_status or record.status
        if status in subject_stats[subj]:
            subject_stats[subj][status] += 1

    for subj in subject_stats:
        s = subject_stats[subj]
        s["weighted_present"] = s["full"] + (s["partial"] * 0.5)
        s["percentage"] = round((s["weighted_present"] / s["total"]) * 100, 2) if s["total"] > 0 else 0.0

    return {
        "total_classes": total,
        "full": full,
        "partial": partial,
        "suspicious": suspicious,
        "absent": absent,
        "present": full + partial,
        "percentage": percentage,
        "attendance_percentage": percentage,
        "subject_wise": subject_stats,
    }


def _attendance_percentage_for_group(students):
    """Calculate attendance percentage for a group of students."""
    weighted_present = 0
    total = 0
    for student in students:
        records = AttendanceRecord.query.filter_by(student_id=student.id).all()
        for r in records:
            total += 1
            status = r.final_attendance_status or r.status
            if status == "full":
                weighted_present += 1
            elif status == "partial":
                weighted_present += 0.5
    return round((weighted_present / total) * 100, 2) if total > 0 else 0


def get_dashboard_stats(college=None, city=None, department=None, section=None, subject=None):
    """Get attendance dashboard statistics with optional filters."""
    today = now_ist().date()  # Use IST date

    student_query = Student.query
    if college:
        student_query = student_query.filter_by(college_name=college)
    if city:
        student_query = student_query.filter_by(city_name=city)
    if department:
        student_query = student_query.filter_by(department=department)
    if section:
        student_query = student_query.filter_by(section=section)

    all_students = student_query.all()
    total_students = len(all_students)
    student_ids = {s.id for s in all_students}

    today_sessions = AttendanceSession.query.filter_by(session_date=today)
    if subject:
        today_sessions = today_sessions.filter_by(subject=subject)

    today_sessions = today_sessions.all()
    today_session_ids = [s.id for s in today_sessions]

    active_sessions = [s for s in today_sessions if s.status in ("active", "end_verification")]

    full_today = partial_today = suspicious_today = absent_today = 0

    if today_session_ids:
        records = AttendanceRecord.query.filter(
            AttendanceRecord.session_id.in_(today_session_ids),
            AttendanceRecord.student_id.in_(student_ids) if student_ids else True,
        ).all()
        for r in records:
            status = r.final_attendance_status or r.status
            if status == "full":
                full_today += 1
            elif status == "partial":
                partial_today += 1
            elif status == "suspicious":
                suspicious_today += 1
            elif status == "absent":
                absent_today += 1

    below_75 = []
    for student in all_students:
        stats = get_student_stats(student.id)
        if stats["total_classes"] > 0 and stats["percentage"] < 75.0:
            below_75.append({
                "student_id": student.id,
                "id": student.roll_number,
                "full_name": student.user.name if student.user else "Unknown",
                "name": student.user.name if student.user else "Unknown",
                "department": student.department,
                "college_name": student.college_name,
                "city_name": student.city_name,
                "percentage": stats["percentage"],
            })

    most_absent = sorted(below_75, key=lambda x: x["percentage"])[:5]

    monthly_trends = []
    for i in range(5, -1, -1):
        month_date = today.replace(day=1)
        month = month_date.month - i
        year = month_date.year
        while month <= 0:
            month += 12
            year -= 1
        try:
            target_date = month_date.replace(year=year, month=month)
        except ValueError:
            continue

        month_sessions = AttendanceSession.query.filter(
            db.extract("month", AttendanceSession.session_date) == target_date.month,
            db.extract("year", AttendanceSession.session_date) == target_date.year,
        ).all()

        if month_sessions:
            session_ids = [s.id for s in month_sessions]
            total_records = AttendanceRecord.query.filter(
                AttendanceRecord.session_id.in_(session_ids)
            ).count()
            full_records = AttendanceRecord.query.filter(
                AttendanceRecord.session_id.in_(session_ids),
                AttendanceRecord.status.in_(["full", "partial"]),
            ).count()
            rate = round((full_records / total_records) * 100, 2) if total_records > 0 else 0
        else:
            rate = 0

        monthly_trends.append({
            "month": target_date.strftime("%b %Y"),
            "rate": rate,
        })

    dept_stats = {}
    for student in all_students:
        dept = student.department
        if dept not in dept_stats:
            dept_stats[dept] = {"total": 0, "present": 0, "students": 0}
        dept_stats[dept]["students"] += 1
        records = AttendanceRecord.query.filter_by(student_id=student.id).all()
        for r in records:
            dept_stats[dept]["total"] += 1
            status = r.final_attendance_status or r.status
            if status in ("full", "partial"):
                dept_stats[dept]["present"] += 1

    department_wise = []
    for dept, stats in dept_stats.items():
        department_wise.append({
            "department": dept,
            "students": stats["students"],
            "percentage": round((stats["present"] / stats["total"]) * 100, 2) if stats["total"] > 0 else 0,
        })

    college_groups = {}
    city_groups = {}
    for student in all_students:
        college = student.college_name or "Unknown"
        city = student.city_name or "Unknown"
        college_groups.setdefault(college, []).append(student)
        city_groups.setdefault(city, []).append(student)

    college_wise = [
        {
            "college": college,
            "students": len(students),
            "percentage": _attendance_percentage_for_group(students),
        }
        for college, students in college_groups.items()
    ]

    city_wise = [
        {
            "city": city,
            "students": len(students),
            "percentage": _attendance_percentage_for_group(students),
        }
        for city, students in city_groups.items()
    ]

    return {
        "total_students": total_students,
        "full_today": full_today,
        "partial_today": partial_today,
        "suspicious_today": suspicious_today,
        "absent_today": absent_today,
        "has_active_session": len(active_sessions) > 0,
        "sessions_today": len(today_session_ids),
        "below_75_count": len(below_75),
        "below_75": below_75,
        "most_absent": most_absent,
        "monthly_trends": monthly_trends,
        "department_wise": department_wise,
        "college_wise": college_wise,
        "city_wise": city_wise,
    }
