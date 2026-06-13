"""Seed demo data for the ATTENDX.

Run from backend/:  python seed_data.py
"""

import os
import random
from datetime import date, datetime, timedelta, timezone

import bcrypt
from dotenv import load_dotenv

load_dotenv()

from app import create_app
from app.extensions import db
from app.models.user import User
from app.models.student import Student
from app.models.allowed_location import AllowedLocation
from app.models.allowed_network import AllowedNetwork
from app.models.attendance_session import AttendanceSession
from app.models.attendance_record import AttendanceRecord
from app.models.notification import Notification
from app.models.audit_log import AuditLog
from app.models.csv_import import CSVImport
from app.models.system_setting import SystemSetting

STUDENT_PASSWORD = os.getenv("DEFAULT_STUDENT_PASSWORD", "Institution@123")
TEACHER_PASSWORD = os.getenv("DEFAULT_TEACHER_PASSWORD", "Faculty@123")

EXTRA_STUDENTS = [
    ("Isha Kapoor", "CS2311", "isha.kapoor@institution.edu", "Female", "GVP College of Engineering", "Hyderabad", "Computer Science", "B"),
    ("Manish Dubey", "CS2312", "manish.dubey@institution.edu", "Male", "ANITS", "Visakhapatnam", "Computer Science", "B"),
    ("Neha Rao", "EC2301", "neha.rao@institution.edu", "Female", "VIT AP", "Chennai", "Electronics", "A"),
    ("Karthik Naidu", "EC2302", "karthik.naidu@institution.edu", "Male", "SRM AP", "Vijayawada", "Electronics", "A"),
    ("Lakshmi Priya", "EC2303", "lakshmi.priya@institution.edu", "Female", "GVP College of Engineering", "Hyderabad", "Electronics", "B"),
]

TEACHERS = [
    ("Dr. Priya Menon", "priya.menon@institution.edu"),
    ("Prof. Rajesh Kumar", "rajesh.kumar@institution.edu"),
]

SUBJECTS = [
    ("Data Structures", "A", "Computer Science"),
    ("Operating Systems", "A", "Computer Science"),
    ("Database Systems", "B", "Computer Science"),
    ("Digital Electronics", "A", "Electronics"),
    ("Machine Learning", "A", "Computer Science"),
]

LOCATIONS = [
    ("Main Campus — Vizag", 17.7973, 83.2158, 250),
    ("Engineering Block", 17.7985, 83.2170, 200),
    ("Library Annex", 17.7960, 83.2140, 150),
]

NETWORKS = [
    ("Campus WiFi", "Campus-WiFi", "106.215.171.39", "192.168.0.0/16"),
    ("Hostel Network", "Hostel-Net", None, "10.0.0.0/8"),
]


def hash_password(password):
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def ensure_admin():
    admin = User.query.filter_by(email="admin@attendance.com").first()
    if admin:
        admin.password_hash = hash_password("SuperAdmin@123")
        admin.must_change_password = False
        admin.is_active = True
    else:
        admin = User(
            name="Super Administrator",
            email="admin@attendance.com",
            password_hash=hash_password("SuperAdmin@123"),
            role="super_admin",
            must_change_password=False,
            is_active=True,
        )
        db.session.add(admin)
    db.session.commit()
    print("✅ Super admin: admin@attendance.com / SuperAdmin@123")


def ensure_teachers(admin_id):
    created = 0
    all_teachers = []

    existing = User.query.filter_by(email="symbiofaculty1@gmail.com").first()
    if existing:
        existing.password_hash = hash_password(TEACHER_PASSWORD)
        existing.must_change_password = False
        all_teachers.append(existing)
    else:
        t = User(
            name="Kalyan Faculty",
            email="symbiofaculty1@gmail.com",
            password_hash=hash_password(TEACHER_PASSWORD),
            role="teacher",
            must_change_password=False,
            is_active=True,
            created_by=admin_id,
        )
        db.session.add(t)
        db.session.flush()
        all_teachers.append(t)
        created += 1

    for name, email in TEACHERS:
        user = User.query.filter_by(email=email).first()
        if not user:
            user = User(
                name=name,
                email=email,
                password_hash=hash_password(TEACHER_PASSWORD),
                role="teacher",
                must_change_password=False,
                is_active=True,
                created_by=admin_id,
            )
            db.session.add(user)
            db.session.flush()
            created += 1
        all_teachers.append(user)

    db.session.commit()
    print(f"✅ Teachers ready ({created} new). Login: symbiofaculty1@gmail.com / {TEACHER_PASSWORD}")
    return all_teachers


def ensure_students(teacher_id):
    created = 0
    hashed = hash_password(STUDENT_PASSWORD)

    for name, roll, email, gender, college, city, dept, section in EXTRA_STUDENTS:
        if User.query.filter_by(email=email).first():
            continue
        user = User(
            name=name,
            email=email,
            password_hash=hashed,
            role="student",
            must_change_password=False,
            is_active=True,
            created_by=teacher_id,
        )
        db.session.add(user)
        db.session.flush()
        student = Student(
            user_id=user.id,
            roll_number=roll,
            department=dept,
            section=section,
            gender=gender,
            college_name=college,
            city_name=city,
            face_registration_status="pending",
            registered_by=teacher_id,
        )
        db.session.add(student)
        created += 1

    # Reset all student passwords so CSV-imported accounts can sign in
    for user in User.query.filter_by(role="student").all():
        user.password_hash = hashed
        user.must_change_password = False
        user.is_active = True

    db.session.commit()
    print(f"✅ Students: {Student.query.count()} total ({created} new)")
    print(f"   Student login password: {STUDENT_PASSWORD}")
    print(f"   Example: aarav.sharma@institution.edu / {STUDENT_PASSWORD}")


def ensure_locations():
    created = 0
    for name, lat, lng, radius in LOCATIONS:
        if AllowedLocation.query.filter_by(name=name).first():
            continue
        db.session.add(AllowedLocation(
            name=name, latitude=lat, longitude=lng,
            radius_meters=radius, is_active=True,
        ))
        created += 1
    db.session.commit()
    print(f"✅ GPS locations: {AllowedLocation.query.count()} ({created} new)")


def ensure_networks():
    created = 0
    for name, ssid, public_ip, vpn_range in NETWORKS:
        if AllowedNetwork.query.filter_by(name=name).first():
            continue
        db.session.add(AllowedNetwork(
            name=name, ssid=ssid, public_ip=public_ip,
            vpn_range=vpn_range, is_active=True,
        ))
        created += 1
    db.session.commit()
    print(f"✅ Networks: {AllowedNetwork.query.count()} ({created} new)")


def pick_status():
    roll = random.random()
    if roll < 0.55:
        return "full"
    if roll < 0.75:
        return "partial"
    if roll < 0.88:
        return "suspicious"
    return "absent"


def seed_sessions_and_records(teachers):
    if AttendanceRecord.query.count() > 50:
        print("ℹ️  Attendance records already seeded, skipping sessions")
        return

    students = Student.query.all()
    if not students:
        print("⚠️  No students to seed attendance for")
        return

    now = datetime.now(timezone.utc)
    today = date.today()
    records_created = 0
    sessions_created = 0

    # Historical sessions (last 14 days)
    for day_offset in range(14, 0, -1):
        session_date = today - timedelta(days=day_offset)
        for subject, section, dept in random.sample(SUBJECTS, k=min(2, len(SUBJECTS))):
            teacher = random.choice(teachers)
            start = datetime.combine(session_date, datetime.min.time()).replace(
                hour=9 + random.randint(0, 4), minute=random.choice([0, 30]),
                tzinfo=timezone.utc,
            )
            session = AttendanceSession(
                teacher_id=teacher.id,
                subject=subject,
                section=section,
                department=dept,
                session_date=session_date,
                start_time=start,
                attendance_window_start=start,
                attendance_window_end=start + timedelta(minutes=15),
                end_verification_start=start + timedelta(hours=1),
                end_verification_end=start + timedelta(hours=1, minutes=15),
                end_time=start + timedelta(hours=1, minutes=20),
                grace_period_minutes=5,
                status="completed",
            )
            db.session.add(session)
            db.session.flush()
            sessions_created += 1

            eligible = [s for s in students if s.section == section and s.department == dept]
            if not eligible:
                eligible = students

            for student in eligible:
                status = pick_status()
                record = AttendanceRecord(
                    session_id=session.id,
                    student_id=student.id,
                    status=status,
                    start_confidence=round(random.uniform(0.72, 0.98), 4) if status != "absent" else None,
                    end_confidence=round(random.uniform(0.70, 0.97), 4) if status == "full" else None,
                    start_marked_at=start + timedelta(minutes=random.randint(0, 10)) if status != "absent" else None,
                    end_marked_at=start + timedelta(hours=1, minutes=random.randint(0, 10)) if status == "full" else None,
                    gps_latitude=17.7973 + random.uniform(-0.001, 0.001),
                    gps_longitude=83.2158 + random.uniform(-0.001, 0.001),
                    gps_validated=True,
                    network_validated=True,
                    client_ip="106.215.171.39",
                )
                db.session.add(record)
                records_created += 1

    # Today's sessions — one active, one completed
    teacher = teachers[0]
    morning_start = now.replace(hour=9, minute=0, second=0, microsecond=0)

    active_session = AttendanceSession(
        teacher_id=teacher.id,
        subject="Data Structures",
        section="A",
        department="Computer Science",
        campus="GVP College of Engineering",
        session_date=today,
        start_time=now - timedelta(minutes=5),
        attendance_window_start=now - timedelta(minutes=5),
        attendance_window_end=now + timedelta(minutes=25),
        grace_period_minutes=5,
        status="active",
    )
    db.session.add(active_session)
    db.session.flush()
    sessions_created += 1

    cs_a_students = [s for s in students if s.section == "A" and s.department == "Computer Science"]
    if not cs_a_students:
        cs_a_students = students[:5]

    for i, student in enumerate(cs_a_students):
        if i < 3:
            status = "present_start"
            start_conf = round(random.uniform(0.80, 0.95), 4)
            start_at = now - timedelta(minutes=random.randint(1, 4))
        else:
            status = "absent"
            start_conf = None
            start_at = None

        db.session.add(AttendanceRecord(
            session_id=active_session.id,
            student_id=student.id,
            status=status,
            start_confidence=start_conf,
            start_marked_at=start_at,
            gps_latitude=17.7973,
            gps_longitude=83.2158,
            gps_validated=True,
            network_validated=True,
            client_ip="106.215.171.39",
        ))
        records_created += 1

    completed_today = AttendanceSession(
        teacher_id=teacher.id,
        subject="Operating Systems",
        section="A",
        department="Computer Science",
        campus="GVP College of Engineering",
        session_date=today,
        start_time=morning_start,
        attendance_window_start=morning_start,
        attendance_window_end=morning_start + timedelta(minutes=15),
        end_verification_start=morning_start + timedelta(hours=1),
        end_verification_end=morning_start + timedelta(hours=1, minutes=15),
        end_time=morning_start + timedelta(hours=1, minutes=20),
        grace_period_minutes=5,
        status="completed",
    )
    db.session.add(completed_today)
    db.session.flush()
    sessions_created += 1

    for student in cs_a_students:
        status = pick_status()
        db.session.add(AttendanceRecord(
            session_id=completed_today.id,
            student_id=student.id,
            status=status,
            start_confidence=round(random.uniform(0.75, 0.96), 4) if status != "absent" else None,
            end_confidence=round(random.uniform(0.73, 0.95), 4) if status == "full" else None,
            start_marked_at=morning_start + timedelta(minutes=random.randint(0, 8)) if status != "absent" else None,
            end_marked_at=morning_start + timedelta(hours=1) if status == "full" else None,
            gps_latitude=17.7973,
            gps_longitude=83.2158,
            gps_validated=True,
            network_validated=True,
            client_ip="106.215.171.39",
        ))
        records_created += 1

    db.session.commit()
    print(f"✅ Sessions: {AttendanceSession.query.count()} ({sessions_created} new)")
    print(f"✅ Attendance records: {AttendanceRecord.query.count()} ({records_created} new)")


def seed_notifications():
    if Notification.query.count() > 0:
        return

    low_attendance_students = Student.query.limit(3).all()
    for student in low_attendance_students:
        db.session.add(Notification(
            student_id=student.id,
            message="Your attendance is below 75%. Please improve your class presence.",
            type="attendance_warning",
            is_read=False,
        ))
        db.session.add(Notification(
            student_id=student.id,
            message="Welcome to the ATTENDX.",
            type="system",
            is_read=True,
        ))

    db.session.commit()
    print(f"✅ Notifications: {Notification.query.count()}")


def seed_audit_logs(admin_id):
    if AuditLog.query.count() > 40:
        return

    actions = [
        ("login", "Super admin logged in"),
        ("csv_import", "Imported 10 students from students_sample.csv"),
        ("location_created", "GPS location Main Campus added"),
        ("network_created", "Campus WiFi network configured"),
        ("session_started", "Data Structures session started for Section A"),
    ]
    for action, details in actions:
        db.session.add(AuditLog(
            user_id=admin_id,
            action=action,
            details=details,
            ip_address="127.0.0.1",
        ))

    db.session.commit()
    print(f"✅ Audit logs: {AuditLog.query.count()}")


def seed_csv_import(teacher_id):
    if CSVImport.query.count() > 0:
        return
    db.session.add(CSVImport(
        teacher_id=teacher_id,
        filename="students_sample.csv",
        total_records=10,
        success_count=10,
        duplicate_count=0,
        failed_count=0,
        status="completed",
    ))
    db.session.commit()


def seed_settings():
    SystemSetting.set_value("institution_name", "Symbiosis Institute of Technology", user_id=1)
    db.session.commit()


def main():
    app = create_app()
    with app.app_context():
        print("🌱 Seeding demo data...\n")
        from app.migrate import reset_student_face_data
        encodings_cleared, students_reset = reset_student_face_data()
        print(f"✅ Face data reset: {encodings_cleared} encodings cleared, {students_reset} students pending enrollment")
        ensure_admin()
        admin = User.query.filter_by(role="super_admin").first()
        teachers = ensure_teachers(admin.id)
        ensure_students(teachers[0].id)
        ensure_locations()
        ensure_networks()
        seed_csv_import(teachers[0].id)
        seed_sessions_and_records(teachers)
        seed_notifications()
        seed_audit_logs(admin.id)
        seed_settings()
        print("\n🎉 Demo data ready! Refresh the app to see dashboards populated.")


if __name__ == "__main__":
    main()
