"""Report service — generate attendance reports in various formats."""

import io
import csv
from datetime import date, timedelta

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer

from app.extensions import db
from app.models.attendance_session import AttendanceSession
from app.models.attendance_record import AttendanceRecord
from app.models.student import Student
from app.services.attendance_service import get_student_stats


ATTENDANCE_THRESHOLD = 75.0


def _final_status_label(percentage):
    """Return pass/fail label based on attendance percentage."""
    return "Pass" if percentage >= ATTENDANCE_THRESHOLD else "Fail"


def get_student_summary_report(college=None, city=None, department=None, section=None):
    """Build per-student attendance summary for reports."""
    query = Student.query.join(Student.user)
    if college:
        query = query.filter(Student.college_name == college)
    if city:
        query = query.filter(Student.city_name == city)
    if department:
        query = query.filter(Student.department == department)
    if section:
        query = query.filter(Student.section == section)

    students = query.order_by(Student.roll_number).all()
    data = []

    for student in students:
        stats = get_student_stats(student.id)
        percentage = stats["percentage"]
        data.append({
            "student_name": student.user.name if student.user else "Unknown",
            "id": student.roll_number,
            "college_name": student.college_name or "",
            "city_name": student.city_name or "",
            "department": student.department,
            "section": student.section,
            "attendance_percentage": percentage,
            "final_attendance_status": _final_status_label(percentage),
        })

    return data


def get_report_data(report_type, start_date=None, end_date=None,
                    student_id=None, subject=None, department=None,
                    college=None, city=None, section=None):
    """Fetch attendance data based on report parameters."""
    if report_type == "summary":
        return get_student_summary_report(college, city, department, section)

    today = date.today()

    if report_type == "daily":
        target = start_date or today
        start_date = target
        end_date = target
    elif report_type == "weekly":
        if not start_date:
            start_date = today - timedelta(days=today.weekday())
        if not end_date:
            end_date = start_date + timedelta(days=6)
    elif report_type == "monthly":
        if not start_date:
            start_date = today.replace(day=1)
        if not end_date:
            next_month = today.replace(day=28) + timedelta(days=4)
            end_date = next_month - timedelta(days=next_month.day)

    query = (
        db.session.query(AttendanceRecord, AttendanceSession, Student)
        .join(AttendanceSession, AttendanceRecord.session_id == AttendanceSession.id)
        .join(Student, AttendanceRecord.student_id == Student.id)
    )

    if start_date:
        query = query.filter(AttendanceSession.session_date >= start_date)
    if end_date:
        query = query.filter(AttendanceSession.session_date <= end_date)
    if student_id:
        query = query.filter(AttendanceRecord.student_id == student_id)
    if subject:
        query = query.filter(AttendanceSession.subject == subject)
    if department:
        query = query.filter(Student.department == department)
    if college:
        query = query.filter(Student.college_name == college)
    if city:
        query = query.filter(Student.city_name == city)
    if section:
        query = query.filter(Student.section == section)

    query = query.order_by(AttendanceSession.session_date.desc(), Student.roll_number)
    results = query.all()

    data = []
    for record, session, student in results:
        stats = get_student_stats(student.id)
        final_status = record.final_attendance_status or record.status
        data.append({
            "date": session.session_date.isoformat(),
            "subject": session.subject,
            "section": student.section,
            "id": student.roll_number,
            "student_name": student.user.name if student.user else "Unknown",
            "college_name": student.college_name or "",
            "city_name": student.city_name or "",
            "department": student.department,
            "attendance_percentage": stats["percentage"],
            "final_attendance_status": final_status,
            "status": record.status,
            "start_time": record.start_marked_at.strftime("%H:%M:%S") if record.start_marked_at else "",
            "end_time": record.end_marked_at.strftime("%H:%M:%S") if record.end_marked_at else "",
            "start_confidence": f"{record.start_confidence:.2f}" if record.start_confidence else "N/A",
            "end_confidence": f"{record.end_confidence:.2f}" if record.end_confidence else "N/A",
            "gps_validated": "Yes" if record.gps_validated else "No",
            "network_validated": "Yes" if record.network_validated else "No",
        })

    return data


def generate_csv(data):
    """Generate CSV file content from report data."""
    if not data:
        return ""

    output = io.StringIO()
    headers = [
        "Student Name", "ID", "College Name", "City", "Department", "Section",
        "Attendance Percentage", "Final Attendance Status",
    ]

    writer = csv.writer(output)
    writer.writerow(headers)

    for row in data:
        writer.writerow([
            row.get("student_name", ""),
            row.get("id", ""),
            row.get("college_name", ""),
            row.get("city_name", ""),
            row.get("department", ""),
            row.get("section", ""),
            row.get("attendance_percentage", ""),
            row.get("final_attendance_status", ""),
        ])

    return output.getvalue()


def generate_pdf(data, title="Attendance Report"):
    """Generate PDF file content from report data."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter)
    styles = getSampleStyleSheet()
    elements = []

    elements.append(Paragraph(title, styles["Title"]))
    elements.append(Spacer(1, 20))

    total = len(data)
    pass_count = sum(
        1 for r in data
        if str(r.get("final_attendance_status", "")).lower() in ("pass", "full", "partial")
        or (isinstance(r.get("attendance_percentage"), (int, float)) and r["attendance_percentage"] >= ATTENDANCE_THRESHOLD)
    )
    fail_count = total - pass_count
    summary_text = f"Total Students: {total} | Pass: {pass_count} | Fail: {fail_count}"
    elements.append(Paragraph(summary_text, styles["Normal"]))
    elements.append(Spacer(1, 20))

    if data:
        table_data = [[
            "Name", "ID", "College", "City", "Dept", "Sec", "Att %", "Status",
        ]]
        for row in data[:200]:
            table_data.append([
                row.get("student_name", ""),
                row.get("id", ""),
                row.get("college_name", ""),
                row.get("city_name", ""),
                row.get("department", ""),
                row.get("section", ""),
                str(row.get("attendance_percentage", "")),
                str(row.get("final_attendance_status", "")).upper(),
            ])

        table = Table(table_data, repeatRows=1)
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e40af")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 8),
            ("FONTSIZE", (0, 1), (-1, -1), 7),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 8),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f0f4ff")]),
        ]))
        elements.append(table)

    doc.build(elements)
    return buffer.getvalue()
