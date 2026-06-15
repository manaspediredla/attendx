"""Super Admin routes — teacher & student management, settings, locations, networks, audit."""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import get_jwt_identity
import bcrypt

from app.extensions import db
from app.models.user import User
from app.models.allowed_location import AllowedLocation
from app.models.allowed_network import AllowedNetwork
from app.models.system_setting import SystemSetting
from app.models.audit_log import AuditLog
from app.models.student import Student
from app.models.teacher_profile import TeacherProfile
from app.models.attendance_record import AttendanceRecord
from app.models.attendance_session import AttendanceSession
from app.services.csv_service import import_students
from app.utils.decorators import super_admin_required, log_audit
from app.utils.helpers import validate_email, validate_required_fields

admin_bp = Blueprint("admin", __name__, url_prefix="/api/admin")


# ── Teacher Management ─────────────────────────────────────────────

@admin_bp.route("/teachers", methods=["GET"])
@super_admin_required
def get_teachers():
    """List all teacher accounts with profiles."""
    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 50, type=int)
    search = request.args.get("search", "").strip()

    query = User.query.filter_by(role="teacher")
    if search:
        query = query.outerjoin(TeacherProfile, User.id == TeacherProfile.user_id).filter(
            db.or_(
                User.name.ilike(f"%{search}%"),
                User.email.ilike(f"%{search}%"),
                TeacherProfile.teacher_id.ilike(f"%{search}%"),
            )
        )

    query = query.order_by(User.created_at.desc())
    paginated = query.paginate(page=page, per_page=per_page, error_out=False)

    teachers = []
    for t in paginated.items:
        profile = TeacherProfile.query.filter_by(user_id=t.id).first()
        if profile:
            teachers.append(profile.to_dict())
        else:
            data = t.to_dict()
            data.update({"teacher_id": None, "gender": None, "department": None,
                         "campus": None, "designation": None, "user_id": t.id})
            teachers.append(data)

    return jsonify({
        "teachers": teachers,
        "total": paginated.total,
        "pages": paginated.pages,
        "current_page": paginated.page,
    }), 200


@admin_bp.route("/teachers", methods=["POST"])
@super_admin_required
def create_teacher():
    """Create a new teacher account with profile."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body required"}), 400

    required = ["name", "email"]
    missing = validate_required_fields(data, required)
    if missing:
        return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400

    email = data["email"].strip().lower()
    if not validate_email(email):
        return jsonify({"error": "Invalid email format"}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({"error": "Email already exists"}), 409

    # Check teacher_id uniqueness
    teacher_id_str = data.get("teacher_id", "").strip()
    if teacher_id_str:
        if TeacherProfile.query.filter_by(teacher_id=teacher_id_str).first():
            return jsonify({"error": f"Teacher ID '{teacher_id_str}' already exists"}), 409

    from flask import current_app
    default_password = current_app.config.get("DEFAULT_TEACHER_PASSWORD", "Teacher@123")
    hashed = bcrypt.hashpw(default_password.encode("utf-8"), bcrypt.gensalt())

    admin_id = int(get_jwt_identity())

    teacher = User(
        name=data["name"].strip(),
        email=email,
        password_hash=hashed.decode("utf-8"),
        role="teacher",
        must_change_password=True,
        created_by=admin_id,
    )
    db.session.add(teacher)
    db.session.flush()

    # Create teacher profile
    profile = TeacherProfile(
        user_id=teacher.id,
        teacher_id=teacher_id_str or None,
        gender=data.get("gender", "").strip() or None,
        department=data.get("department", "").strip() or None,
        campus=data.get("campus", "").strip() or None,
        designation=data.get("designation", "").strip() or None,
    )
    db.session.add(profile)
    db.session.commit()

    log_audit("teacher_created", f"Teacher {email} created by admin {admin_id}")

    return jsonify({
        "message": "Teacher created successfully",
        "teacher": profile.to_dict(),
        "default_password": default_password,
    }), 201


@admin_bp.route("/teachers/<int:teacher_id>", methods=["PUT"])
@super_admin_required
def update_teacher(teacher_id):
    """Update a teacher account and profile."""
    teacher = User.query.get(teacher_id)
    if not teacher or teacher.role != "teacher":
        return jsonify({"error": "Teacher not found"}), 404

    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body required"}), 400

    if "name" in data:
        teacher.name = data["name"].strip()
    if "email" in data:
        new_email = data["email"].strip().lower()
        if new_email != teacher.email:
            if not validate_email(new_email):
                return jsonify({"error": "Invalid email format"}), 400
            if User.query.filter_by(email=new_email).first():
                return jsonify({"error": "Email already exists"}), 409
            teacher.email = new_email
    if "is_active" in data:
        teacher.is_active = bool(data["is_active"])

    # Update teacher profile
    profile = TeacherProfile.query.filter_by(user_id=teacher_id).first()
    if not profile:
        profile = TeacherProfile(user_id=teacher_id)
        db.session.add(profile)

    if "teacher_id" in data:
        new_tid = data["teacher_id"].strip()
        if new_tid and new_tid != profile.teacher_id:
            existing = TeacherProfile.query.filter_by(teacher_id=new_tid).first()
            if existing and existing.user_id != teacher_id:
                return jsonify({"error": f"Teacher ID '{new_tid}' already in use"}), 409
            profile.teacher_id = new_tid
    if "gender" in data:
        profile.gender = data["gender"].strip() or None
    if "department" in data:
        profile.department = data["department"].strip() or None
    if "campus" in data:
        profile.campus = data["campus"].strip() or None
    if "designation" in data:
        profile.designation = data["designation"].strip() or None

    db.session.commit()
    log_audit("teacher_updated", f"Teacher {teacher.email} updated")

    return jsonify({
        "message": "Teacher updated successfully",
        "teacher": profile.to_dict(),
    }), 200


@admin_bp.route("/teachers/<int:teacher_id>", methods=["DELETE"])
@super_admin_required
def delete_teacher(teacher_id):
    """Delete a teacher account."""
    teacher = User.query.get(teacher_id)
    if not teacher or teacher.role != "teacher":
        return jsonify({"error": "Teacher not found"}), 404

    email = teacher.email
    db.session.delete(teacher)
    db.session.commit()

    log_audit("teacher_deleted", f"Teacher {email} deleted")

    return jsonify({"message": "Teacher deleted successfully"}), 200


@admin_bp.route("/teachers/filters", methods=["GET"])
@super_admin_required
def get_teacher_filters():
    """Get distinct filter values for teacher list."""
    departments = db.session.query(TeacherProfile.department).distinct().all()
    campuses = db.session.query(TeacherProfile.campus).distinct().all()
    genders = db.session.query(TeacherProfile.gender).distinct().all()

    return jsonify({
        "departments": sorted({d[0] for d in departments if d[0]}),
        "campuses": sorted({c[0] for c in campuses if c[0]}),
        "genders": sorted({g[0] for g in genders if g[0]}),
    }), 200


@admin_bp.route("/import-teachers-csv", methods=["POST"])
@super_admin_required
def import_teachers_csv():
    """Import teachers from a CSV file."""
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file = request.files["file"]
    if not file.filename or not file.filename.lower().endswith(".csv"):
        return jsonify({"error": "Only CSV files are accepted"}), 400

    admin_id = int(get_jwt_identity())

    try:
        file_content = file.read().decode("utf-8-sig")
    except UnicodeDecodeError:
        try:
            file.seek(0)
            file_content = file.read().decode("latin-1")
        except Exception:
            return jsonify({"error": "Failed to read CSV file"}), 400

    from app.services.teacher_csv_service import import_teachers
    result = import_teachers(file_content, file.filename, admin_id)

    if result["success"]:
        log_audit("teacher_csv_import", f"Admin imported {result['success_count']} teachers")
        return jsonify({
            "message": f"Import completed: {result['success_count']} teachers created",
            **result,
        }), 201
    else:
        return jsonify({"error": "Import failed", **result}), 400


@admin_bp.route("/reset-password/<int:user_id>", methods=["POST"])
@super_admin_required
def reset_user_password(user_id):
    """Reset any user's password to default."""
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    from flask import current_app

    if user.role == "student":
        default_pw = current_app.config.get("DEFAULT_STUDENT_PASSWORD", "Institution@123")
    elif user.role == "teacher":
        default_pw = current_app.config.get("DEFAULT_TEACHER_PASSWORD", "Teacher@123")
    else:
        return jsonify({"error": "Cannot reset super admin password this way"}), 400

    hashed = bcrypt.hashpw(default_pw.encode("utf-8"), bcrypt.gensalt())
    user.password_hash = hashed.decode("utf-8")
    user.must_change_password = True
    db.session.commit()

    log_audit("password_reset", f"Password reset for {user.email}")

    return jsonify({
        "message": f"Password reset to default for {user.email}",
        "default_password": default_pw,
    }), 200


# ── GPS Location Management ────────────────────────────────────────

@admin_bp.route("/locations", methods=["GET"])
@super_admin_required
def get_locations():
    """List all allowed GPS locations."""
    locations = AllowedLocation.query.order_by(AllowedLocation.name).all()
    return jsonify([loc.to_dict() for loc in locations]), 200


@admin_bp.route("/locations", methods=["POST"])
@super_admin_required
def create_location():
    """Add a new allowed GPS location."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body required"}), 400

    required = ["name", "latitude", "longitude"]
    missing = validate_required_fields(data, required)
    if missing:
        return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400

    location = AllowedLocation(
        name=data["name"].strip(),
        city_name=data.get("city_name", "").strip() or None,
        latitude=float(data["latitude"]),
        longitude=float(data["longitude"]),
        radius_meters=int(data.get("radius_meters", 250)),
        is_active=data.get("is_active", True),
    )
    db.session.add(location)
    db.session.commit()

    log_audit("location_created", f"GPS location '{location.name}' added")

    return jsonify({
        "message": "Location added successfully",
        "location": location.to_dict(),
    }), 201


@admin_bp.route("/locations/<int:location_id>", methods=["PUT"])
@super_admin_required
def update_location(location_id):
    """Update an allowed GPS location."""
    location = AllowedLocation.query.get(location_id)
    if not location:
        return jsonify({"error": "Location not found"}), 404

    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body required"}), 400

    if "name" in data:
        location.name = data["name"].strip()
    if "city_name" in data:
        location.city_name = data["city_name"].strip() or None
    if "latitude" in data:
        location.latitude = float(data["latitude"])
    if "longitude" in data:
        location.longitude = float(data["longitude"])
    if "radius_meters" in data:
        location.radius_meters = int(data["radius_meters"])
    if "is_active" in data:
        location.is_active = bool(data["is_active"])

    db.session.commit()
    log_audit("location_updated", f"GPS location '{location.name}' updated")

    return jsonify({
        "message": "Location updated successfully",
        "location": location.to_dict(),
    }), 200


@admin_bp.route("/locations/<int:location_id>", methods=["DELETE"])
@super_admin_required
def delete_location(location_id):
    """Delete an allowed GPS location."""
    location = AllowedLocation.query.get(location_id)
    if not location:
        return jsonify({"error": "Location not found"}), 404

    name = location.name
    db.session.delete(location)
    db.session.commit()

    log_audit("location_deleted", f"GPS location '{name}' deleted")
    return jsonify({"message": "Location deleted successfully"}), 200


@admin_bp.route("/geocode", methods=["GET"])
@super_admin_required
def geocode_search():
    """Location search using Photon (free, fuzzy matching) with Nominatim fallback."""
    import requests as http_requests

    query = request.args.get("q", "").strip()
    if not query:
        return jsonify([]), 200

    # ── Photon API (free, no key, fuzzy/typo matching) ──────────
    try:
        resp = http_requests.get(
            "https://photon.komoot.io/api/",
            params={"q": query, "limit": 10, "lang": "en"},
            headers={"User-Agent": "ATTENDX/1.0"},
            timeout=5,
        )
        resp.raise_for_status()
        features = resp.json().get("features", [])

        results = []
        for f in features:
            props = f.get("properties", {})
            coords = f.get("geometry", {}).get("coordinates", [0, 0])
            # Build display name from address parts
            parts = [props.get("name", "")]
            for key in ("street", "district", "city", "state", "country"):
                val = props.get(key)
                if val and val not in parts:
                    parts.append(val)
            display = ", ".join(p for p in parts if p)

            results.append({
                "place_id": f"{props.get('osm_type', 'N')}{props.get('osm_id', '')}",
                "display_name": display,
                "name": props.get("name", display.split(",")[0]),
                "lat": str(coords[1]),
                "lon": str(coords[0]),
            })

        if results:
            return jsonify(results), 200
    except Exception:
        pass

    # ── Nominatim fallback ──────────────────────────────────────
    try:
        resp = http_requests.get(
            "https://nominatim.openstreetmap.org/search",
            params={"q": query, "format": "json", "limit": 10, "dedupe": 1},
            headers={"User-Agent": "ATTENDX/1.0", "Accept-Language": "en"},
            timeout=5,
        )
        resp.raise_for_status()
        return jsonify(resp.json()[:10]), 200
    except Exception:
        return jsonify([]), 200


# ── Network Management ─────────────────────────────────────────────

@admin_bp.route("/networks", methods=["GET"])
@super_admin_required
def get_networks():
    """List all allowed networks."""
    networks = AllowedNetwork.query.order_by(AllowedNetwork.name).all()
    return jsonify([n.to_dict() for n in networks]), 200


@admin_bp.route("/networks", methods=["POST"])
@super_admin_required
def create_network():
    """Add a new allowed network."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body required"}), 400

    required = ["name"]
    missing = validate_required_fields(data, required)
    if missing:
        return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400

    network = AllowedNetwork(
        name=data["name"].strip(),
        ssid=data.get("ssid", "").strip() or None,
        public_ip=data.get("public_ip", "").strip() or None,
        vpn_range=data.get("vpn_range", "").strip() or None,
        is_active=data.get("is_active", True),
    )
    db.session.add(network)
    db.session.commit()

    log_audit("network_created", f"Network '{network.name}' added")

    return jsonify({
        "message": "Network added successfully",
        "network": network.to_dict(),
    }), 201


@admin_bp.route("/networks/<int:network_id>", methods=["PUT"])
@super_admin_required
def update_network(network_id):
    """Update an allowed network."""
    network = AllowedNetwork.query.get(network_id)
    if not network:
        return jsonify({"error": "Network not found"}), 404

    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body required"}), 400

    if "name" in data:
        network.name = data["name"].strip()
    if "ssid" in data:
        network.ssid = data["ssid"].strip() or None
    if "public_ip" in data:
        network.public_ip = data["public_ip"].strip() or None
    if "vpn_range" in data:
        network.vpn_range = data["vpn_range"].strip() or None
    if "is_active" in data:
        network.is_active = bool(data["is_active"])

    db.session.commit()
    log_audit("network_updated", f"Network '{network.name}' updated")

    return jsonify({
        "message": "Network updated successfully",
        "network": network.to_dict(),
    }), 200


@admin_bp.route("/networks/<int:network_id>", methods=["DELETE"])
@super_admin_required
def delete_network(network_id):
    """Delete an allowed network."""
    network = AllowedNetwork.query.get(network_id)
    if not network:
        return jsonify({"error": "Network not found"}), 404

    name = network.name
    db.session.delete(network)
    db.session.commit()

    log_audit("network_deleted", f"Network '{name}' deleted")
    return jsonify({"message": "Network deleted successfully"}), 200


# ── System Settings ─────────────────────────────────────────────────

@admin_bp.route("/settings", methods=["GET"])
@super_admin_required
def get_settings():
    """Get all system settings."""
    settings = SystemSetting.query.order_by(SystemSetting.key).all()
    return jsonify([s.to_dict() for s in settings]), 200


@admin_bp.route("/settings", methods=["PUT"])
@super_admin_required
def update_settings():
    """Update one or more system settings."""
    data = request.get_json()
    if not data or "settings" not in data:
        return jsonify({"error": "Settings data required"}), 400

    admin_id = int(get_jwt_identity())

    for item in data["settings"]:
        key = item.get("key", "").strip()
        value = item.get("value", "")
        if key:
            SystemSetting.set_value(key, value, user_id=admin_id)

    log_audit("settings_updated", f"System settings updated by admin {admin_id}")
    return jsonify({"message": "Settings updated successfully"}), 200


# ── Audit Logs ──────────────────────────────────────────────────────

@admin_bp.route("/audit-logs", methods=["GET"])
@super_admin_required
def get_audit_logs():
    """Get audit logs with pagination."""
    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 50, type=int)
    action_filter = request.args.get("action", "").strip()

    query = AuditLog.query

    if action_filter:
        query = query.filter(AuditLog.action.ilike(f"%{action_filter}%"))

    query = query.order_by(AuditLog.created_at.desc())
    paginated = query.paginate(page=page, per_page=per_page, error_out=False)

    return jsonify({
        "logs": [log.to_dict() for log in paginated.items],
        "total": paginated.total,
        "pages": paginated.pages,
        "current_page": paginated.page,
    }), 200


# ── Student Management (Super Admin) ───────────────────────────────

@admin_bp.route("/students", methods=["GET"])
@super_admin_required
def get_students():
    """List all students with filters and attendance stats."""
    from app.services.attendance_service import get_student_stats

    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 50, type=int)
    search = request.args.get("search", "").strip()
    college = request.args.get("college", "").strip()
    city = request.args.get("city", "").strip()
    department = request.args.get("department", "").strip()
    section = request.args.get("section", "").strip()
    gender = request.args.get("gender", "").strip()
    sort_by = request.args.get("sort_by", "id").strip()
    sort_order = request.args.get("sort_order", "asc").strip()

    query = Student.query.join(User, Student.user_id == User.id)

    if search:
        query = query.filter(
            db.or_(
                User.name.ilike(f"%{search}%"),
                Student.roll_number.ilike(f"%{search}%"),
                User.email.ilike(f"%{search}%"),
            )
        )
    if college:
        query = query.filter(Student.college_name == college)
    if city:
        query = query.filter(Student.city_name == city)
    if department:
        query = query.filter(Student.department == department)
    if section:
        query = query.filter(Student.section == section)
    if gender:
        query = query.filter(Student.gender == gender)

    sort_column = {
        "name": User.name,
        "id": Student.roll_number,
        "roll_number": Student.roll_number,
        "email": User.email,
        "college": Student.college_name,
        "campus": Student.college_name,
        "city": Student.city_name,
        "department": Student.department,
        "section": Student.section,
        "gender": Student.gender,
    }.get(sort_by, Student.roll_number)

    if sort_order == "desc":
        query = query.order_by(sort_column.desc())
    else:
        query = query.order_by(sort_column.asc())

    paginated = query.paginate(page=page, per_page=per_page, error_out=False)

    students = []
    for s in paginated.items:
        stats = get_student_stats(s.id)
        data = s.to_dict()
        data["attendance_percentage"] = stats["percentage"]
        data["face_enrollment_status"] = "enrolled" if s.face_registered else "pending"
        students.append(data)

    if sort_by == "attendance_percentage":
        students.sort(
            key=lambda x: x["attendance_percentage"],
            reverse=(sort_order == "desc"),
        )

    return jsonify({
        "students": students,
        "total": paginated.total,
        "pages": paginated.pages,
        "current_page": paginated.page,
    }), 200


@admin_bp.route("/students", methods=["POST"])
@super_admin_required
def create_student():
    """Manually create a single student."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body required"}), 400

    required = ["full_name", "email", "roll_number", "department", "section", "college_name", "city_name"]
    missing = validate_required_fields(data, required)
    if missing:
        return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400

    email = data["email"].strip().lower()
    if not validate_email(email):
        return jsonify({"error": "Invalid email format"}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({"error": "Email already exists"}), 409

    roll_number = data["roll_number"].strip()
    if Student.query.filter_by(roll_number=roll_number).first():
        return jsonify({"error": f"Roll number '{roll_number}' already exists"}), 409

    from flask import current_app
    default_password = current_app.config.get("DEFAULT_STUDENT_PASSWORD", "Institution@123")
    hashed = bcrypt.hashpw(default_password.encode("utf-8"), bcrypt.gensalt())
    admin_id = int(get_jwt_identity())

    user = User(
        name=data["full_name"].strip(),
        email=email,
        password_hash=hashed.decode("utf-8"),
        role="student",
        must_change_password=False,
        created_by=admin_id,
    )
    db.session.add(user)
    db.session.flush()

    student = Student(
        user_id=user.id,
        roll_number=roll_number,
        department=data["department"].strip(),
        section=data["section"].strip(),
        year=int(data.get("year", 1)),
        gender=data.get("gender", "").strip() or None,
        college_name=data["college_name"].strip(),
        city_name=data["city_name"].strip(),
        face_registration_status="pending",
        face_registered=False,
        first_login_completed=False,
        registered_by=admin_id,
    )
    db.session.add(student)
    db.session.commit()

    log_audit("student_created", f"Student {roll_number} ({email}) created by admin {admin_id}")

    return jsonify({
        "message": "Student created successfully",
        "student": student.to_dict(),
        "default_password": default_password,
    }), 201


@admin_bp.route("/students/<student_roll>", methods=["PUT"])
@super_admin_required
def update_student(student_roll):
    """Update a student's details."""
    student = Student.query.filter_by(roll_number=student_roll).first()
    if not student:
        return jsonify({"error": "Student not found"}), 404

    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body required"}), 400

    user = student.user
    if "full_name" in data:
        user.name = data["full_name"].strip()
    if "email" in data:
        new_email = data["email"].strip().lower()
        if new_email != user.email:
            if not validate_email(new_email):
                return jsonify({"error": "Invalid email format"}), 400
            if User.query.filter_by(email=new_email).first():
                return jsonify({"error": "Email already exists"}), 409
            user.email = new_email
    if "department" in data:
        student.department = data["department"].strip()
    if "section" in data:
        student.section = data["section"].strip()
    if "year" in data:
        student.year = int(data["year"])
    if "gender" in data:
        student.gender = data["gender"].strip() or None
    if "college_name" in data:
        student.college_name = data["college_name"].strip()
    if "city_name" in data:
        student.city_name = data["city_name"].strip()

    db.session.commit()
    log_audit("student_updated", f"Student {student.roll_number} updated")

    return jsonify({
        "message": "Student updated successfully",
        "student": student.to_dict(),
    }), 200


@admin_bp.route("/students/<student_roll>", methods=["DELETE"])
@super_admin_required
def delete_student(student_roll):
    """Delete a student and their user account."""
    student = Student.query.filter_by(roll_number=student_roll).first()
    if not student:
        return jsonify({"error": "Student not found"}), 404

    user = student.user
    roll = student.roll_number
    db.session.delete(user)  # Cascades to student + face encodings + records
    db.session.commit()

    log_audit("student_deleted", f"Student {roll} deleted")
    return jsonify({"message": f"Student {roll} deleted successfully"}), 200


@admin_bp.route("/import-csv", methods=["POST"])
@super_admin_required
def upload_student_csv():
    """Upload and process a CSV file to import students (Super Admin)."""
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file = request.files["file"]
    if not file.filename or not file.filename.lower().endswith(".csv"):
        return jsonify({"error": "Only CSV files are accepted"}), 400

    admin_id = int(get_jwt_identity())

    try:
        file_content = file.read().decode("utf-8-sig")
    except UnicodeDecodeError:
        try:
            file.seek(0)
            file_content = file.read().decode("latin-1")
        except Exception:
            return jsonify({"error": "Failed to read CSV file"}), 400

    result = import_students(file_content, file.filename, admin_id)

    if result["success"]:
        log_audit("student_csv_import", f"Admin imported {result['success_count']} students from {file.filename}")
        return jsonify({
            "message": f"Import completed: {result['success_count']} students created",
            **result,
        }), 201
    else:
        return jsonify({"error": "Import failed", **result}), 400


@admin_bp.route("/students/filters", methods=["GET"])
@super_admin_required
def get_student_filter_options():
    """Get distinct filter values for student list."""
    return jsonify({
        "colleges": sorted({c[0] for c in db.session.query(Student.college_name).distinct().all() if c[0]}),
        "campuses": sorted({c[0] for c in db.session.query(Student.college_name).distinct().all() if c[0]}),
        "cities": sorted({c[0] for c in db.session.query(Student.city_name).distinct().all() if c[0]}),
        "departments": sorted({d[0] for d in db.session.query(Student.department).distinct().all() if d[0]}),
        "sections": sorted({s[0] for s in db.session.query(Student.section).distinct().all() if s[0]}),
        "genders": sorted({g[0] for g in db.session.query(Student.gender).distinct().all() if g[0]}),
    }), 200


# ── Analytics Dashboard ─────────────────────────────────────────────

@admin_bp.route("/analytics", methods=["GET"])
@super_admin_required
def get_analytics():
    """Get institution-wide analytics for super admin dashboard."""
    from datetime import date
    from app.services.attendance_service import get_student_stats, get_dashboard_stats

    today = date.today()

    total_students = Student.query.count()
    total_teachers = User.query.filter_by(role="teacher").count()

    # Today's sessions
    today_sessions = AttendanceSession.query.filter_by(session_date=today).all()
    today_session_ids = [s.id for s in today_sessions]

    # Count by status type
    full_today = 0
    partial_today = 0
    suspicious_today = 0
    absent_today = 0
    gps_failures = 0
    network_failures = 0

    if today_session_ids:
        records_today = AttendanceRecord.query.filter(
            AttendanceRecord.session_id.in_(today_session_ids)
        ).all()
        for r in records_today:
            if r.status == "full":
                full_today += 1
            elif r.status == "partial":
                partial_today += 1
            elif r.status == "suspicious":
                suspicious_today += 1
            elif r.status == "absent":
                absent_today += 1
            if not r.gps_validated and r.gps_latitude is not None:
                gps_failures += 1
            if not r.network_validated and r.client_ip is not None:
                network_failures += 1

    # Students below 75%
    below_75 = []
    all_students = Student.query.all()
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

    # Monthly trends (last 6 months)
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
                AttendanceRecord.status == "full",
            ).count()
            rate = round((full_records / total_records) * 100, 2) if total_records > 0 else 0
        else:
            rate = 0

        monthly_trends.append({
            "month": target_date.strftime("%b %Y"),
            "rate": rate,
        })

    dashboard = get_dashboard_stats()

    return jsonify({
        "total_students": total_students,
        "total_teachers": total_teachers,
        "attendance_today": full_today + partial_today,
        "full_today": full_today,
        "partial_today": partial_today,
        "suspicious_today": suspicious_today,
        "absent_today": absent_today,
        "gps_failures": gps_failures,
        "network_failures": network_failures,
        "below_75_count": len(below_75),
        "below_75": below_75[:20],
        "sessions_today": len(today_session_ids),
        "monthly_trends": monthly_trends,
        "college_wise": dashboard.get("college_wise", []),
        "city_wise": dashboard.get("city_wise", []),
    }), 200
