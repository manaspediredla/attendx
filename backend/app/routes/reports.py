"""Report generation and export routes."""

from datetime import datetime

from flask import Blueprint, request, jsonify, Response

from app.services.report_service import get_report_data, generate_csv, generate_pdf
from app.utils.decorators import teacher_or_admin_required

reports_bp = Blueprint("reports", __name__, url_prefix="/api/reports")


@reports_bp.route("/summary", methods=["GET"])
@teacher_or_admin_required
def summary_report():
    """Get student attendance summary report."""
    college = request.args.get("college", "").strip() or None
    city = request.args.get("city", "").strip() or None
    department = request.args.get("department", "").strip() or None
    section = request.args.get("section", "").strip() or None

    data = get_report_data("summary", college=college, city=city, department=department, section=section)
    return jsonify({"report": data, "type": "summary"}), 200


@reports_bp.route("/daily", methods=["GET"])
@teacher_or_admin_required
def daily_report():
    """Get daily attendance report."""
    date_str = request.args.get("date")
    start_date = datetime.strptime(date_str, "%Y-%m-%d").date() if date_str else None

    data = get_report_data("daily", start_date=start_date)
    return jsonify({"report": data, "type": "daily"}), 200


@reports_bp.route("/weekly", methods=["GET"])
@teacher_or_admin_required
def weekly_report():
    """Get weekly attendance report."""
    start = request.args.get("start_date")
    end = request.args.get("end_date")
    start_date = datetime.strptime(start, "%Y-%m-%d").date() if start else None
    end_date = datetime.strptime(end, "%Y-%m-%d").date() if end else None

    data = get_report_data("weekly", start_date=start_date, end_date=end_date)
    return jsonify({"report": data, "type": "weekly"}), 200


@reports_bp.route("/monthly", methods=["GET"])
@teacher_or_admin_required
def monthly_report():
    """Get monthly attendance report."""
    start = request.args.get("start_date")
    end = request.args.get("end_date")
    start_date = datetime.strptime(start, "%Y-%m-%d").date() if start else None
    end_date = datetime.strptime(end, "%Y-%m-%d").date() if end else None

    data = get_report_data("monthly", start_date=start_date, end_date=end_date)
    return jsonify({"report": data, "type": "monthly"}), 200


@reports_bp.route("/student/<int:student_id>", methods=["GET"])
@teacher_or_admin_required
def student_report(student_id):
    """Get per-student attendance report."""
    data = get_report_data("student", student_id=student_id)
    return jsonify({"report": data, "type": "student"}), 200


@reports_bp.route("/defaulters", methods=["GET"])
@teacher_or_admin_required
def defaulters_report():
    """Get attendance defaulter report (students below threshold)."""
    from app.models.student import Student
    from app.services.attendance_service import get_student_stats

    threshold = float(request.args.get("threshold", 75.0))
    department = request.args.get("department", "").strip()

    query = Student.query
    if department:
        query = query.filter_by(department=department)

    students = query.all()
    defaulters = []

    for student in students:
        stats = get_student_stats(student.id)
        if stats["total_classes"] > 0 and stats["percentage"] < threshold:
            defaulters.append({
                "student_id": student.id,
                "id": student.roll_number,
                "full_name": student.user.name if student.user else "Unknown",
                "name": student.user.name if student.user else "Unknown",
                "email": student.user.email if student.user else None,
                "college_name": student.college_name,
                "city_name": student.city_name,
                "department": student.department,
                "section": student.section,
                "total_classes": stats["total_classes"],
                "present": stats["present"],
                "absent": stats["absent"],
                "attendance_percentage": stats["percentage"],
                "final_attendance_status": "Fail",
            })

    defaulters.sort(key=lambda x: x["percentage"])

    return jsonify({
        "report": defaulters,
        "type": "defaulters",
        "threshold": threshold,
        "total_defaulters": len(defaulters),
    }), 200


@reports_bp.route("/export", methods=["GET"])
@teacher_or_admin_required
def export_report():
    """Export attendance report as CSV or PDF.

    Query params:
        format: 'csv' or 'pdf'
        type: 'daily', 'weekly', 'monthly', 'student', 'subject'
        start_date, end_date, student_id, subject, department
    """
    export_format = request.args.get("format", "csv").lower()
    report_type = request.args.get("type", "daily")

    start = request.args.get("start_date")
    end = request.args.get("end_date")
    start_date = datetime.strptime(start, "%Y-%m-%d").date() if start else None
    end_date = datetime.strptime(end, "%Y-%m-%d").date() if end else None

    student_id = request.args.get("student_id", type=int)
    subject = request.args.get("subject")
    department = request.args.get("department")

    college = request.args.get("college", "").strip() or None
    city = request.args.get("city", "").strip() or None
    section = request.args.get("section", "").strip() or None

    data = get_report_data(
        report_type,
        start_date=start_date,
        end_date=end_date,
        student_id=student_id,
        subject=subject,
        department=department,
        college=college,
        city=city,
        section=section,
    )

    if export_format == "pdf":
        title = f"Attendance Report — {report_type.capitalize()}"
        pdf_content = generate_pdf(data, title)
        return Response(
            pdf_content,
            mimetype="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=attendance_{report_type}.pdf"},
        )
    else:
        csv_content = generate_csv(data)
        return Response(
            csv_content,
            mimetype="text/csv",
            headers={"Content-Disposition": f"attachment; filename=attendance_{report_type}.csv"},
        )
