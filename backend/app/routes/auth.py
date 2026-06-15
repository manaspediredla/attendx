"""Authentication routes — login, face 2FA, enrollment, logout, password."""

from datetime import datetime, timezone, timedelta

from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    get_jwt_identity,
    jwt_required,
    decode_token,
    get_jwt,
)
import bcrypt

from app.extensions import db
from app.models.user import User
from app.models.face_encoding import FaceEncoding
from app.models.system_setting import SystemSetting
from app.services.face_service import (
    register_face_encodings,
    recognize_student_face,
    decode_base64_image,
    preview_face_detection,
)
from app.services.antispoof_service import run_antispoof_pipeline
from app.utils.helpers import validate_required_fields
from app.utils.decorators import log_audit
from app.utils.request_helpers import get_client_ip, normalize_ip

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


def _issue_tokens(user):
    """Create access + refresh tokens for an authenticated user."""
    additional_claims = {"role": user.role, "name": user.name}
    access_token = create_access_token(
        identity=str(user.id),
        additional_claims=additional_claims,
    )
    refresh_token = create_refresh_token(
        identity=str(user.id),
        additional_claims=additional_claims,
    )
    return access_token, refresh_token


def _create_face_challenge_token(user_id, purpose):
    """Short-lived token for face enrollment or login verification."""
    return create_access_token(
        identity=str(user_id),
        additional_claims={"type": "face_challenge", "purpose": purpose},
        expires_delta=timedelta(minutes=10),
    )


def _verify_face_challenge_token(token):
    """Validate face challenge token and return (user_id, purpose)."""
    try:
        decoded = decode_token(token)
        if decoded.get("type") != "face_challenge":
            return None, None, "Invalid challenge token"
        return int(decoded["sub"]), decoded.get("purpose"), None
    except Exception:
        return None, None, "Invalid or expired challenge token"


def _student_needs_face_enrollment(student):
    """Check if student must complete self face enrollment on login."""
    min_images = current_app.config.get("FACE_MIN_IMAGES", 20)
    encoding_count = FaceEncoding.query.filter_by(student_id=student.id).count()
    return not student.face_registered or encoding_count < min_images


def _verify_face_frames(student_id, images):
    """Multi-frame face verification with anti-spoofing heuristics."""
    min_frames = current_app.config.get("FACE_LOGIN_MIN_FRAMES", 3)
    min_votes = current_app.config.get("FACE_MIN_MATCH_VOTES", 2)
    tolerance = current_app.config.get("FACE_RECOGNITION_TOLERANCE", 0.55)

    if not images or len(images) < min_frames:
        return {
            "matched": False,
            "message": f"At least {min_frames} face frames required",
            "confidence": 0,
        }

    match_count = 0
    confidences = []
    last_result = None

    for img_b64 in images:
        image = decode_base64_image(img_b64)
        if image is None:
            continue
        result = recognize_student_face(image, student_id)
        last_result = result
        if result.get("matched"):
            match_count += 1
            confidences.append(result.get("confidence", 0))

    avg_confidence = sum(confidences) / len(confidences) if confidences else 0

    if match_count >= min_votes:
        return {
            "matched": True,
            "confidence": avg_confidence,
            "match_count": match_count,
            "frames_checked": len(images),
            "face_detected": True,
        }

    return {
        "matched": False,
        "confidence": avg_confidence,
        "match_count": match_count,
        "frames_checked": len(images),
        "face_detected": last_result.get("face_detected", False) if last_result else False,
        "impostor_detected": last_result.get("impostor_detected", False) if last_result else False,
        "message": "Face Verification Failed",
        "threshold_percent": round((1.0 - tolerance) * 100, 1),
    }


@auth_bp.route("/login", methods=["POST"])
def login():
    """Step 1: Authenticate with email + password.

    Students require face enrollment or face verification before tokens are issued.
    """
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body required"}), 400

    missing = validate_required_fields(data, ["email", "password"])
    if missing:
        return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400

    email = data["email"].strip().lower()
    password = data["password"]

    user = User.query.filter_by(email=email).first()
    if not user:
        return jsonify({"error": "Invalid email or password"}), 401

    if not user.is_active:
        return jsonify({"error": "Account is disabled. Contact your administrator."}), 403

    if not bcrypt.checkpw(password.encode("utf-8"), user.password_hash.encode("utf-8")):
        log_audit("login_failed", f"Failed login attempt for {email}")
        return jsonify({"error": "Invalid email or password"}), 401

    if user.role == "super_admin":
        whitelisted = SystemSetting.get_value("super_admin_whitelisted_ips", "")
        if whitelisted:
            allowed_ips = [normalize_ip(ip) for ip in whitelisted.split(",") if ip.strip()]
            allowed_ips = [ip for ip in allowed_ips if ip]
            client_ip = get_client_ip(request)
            if allowed_ips and client_ip not in allowed_ips:
                log_audit("login_blocked_ip", f"Super Admin login blocked from IP: {client_ip}")
                return jsonify({"error": "Access denied from this network"}), 403

    # Students require face step before full login
    if user.role == "student" and user.student:
        student = user.student
        if _student_needs_face_enrollment(student):
            challenge = _create_face_challenge_token(user.id, "enrollment")
            return jsonify({
                "step": "face_enrollment",
                "message": "Face enrollment required on first login",
                "face_challenge_token": challenge,
                "user": user.to_dict(),
                "student_id": student.id,
                "min_images": current_app.config.get("FACE_MIN_IMAGES", 20),
                "recommended_images": current_app.config.get("FACE_RECOMMENDED_IMAGES", 30),
            }), 200

        challenge = _create_face_challenge_token(user.id, "verification")
        return jsonify({
            "step": "face_verification",
            "message": "Live face verification required",
            "face_challenge_token": challenge,
            "user": user.to_dict(),
            "student_id": student.id,
        }), 200

    user.last_login = datetime.now(timezone.utc)
    db.session.commit()

    access_token, refresh_token = _issue_tokens(user)
    log_audit("login_success", f"User {user.email} logged in as {user.role}")

    response_data = {
        "step": "complete",
        "message": "Login successful",
        "access_token": access_token,
        "refresh_token": refresh_token,
        "user": user.to_dict(),
        "must_change_password": user.must_change_password,
    }

    return jsonify(response_data), 200


@auth_bp.route("/enroll-face", methods=["POST"])
def enroll_face():
    """Student self face enrollment during first login (cannot be skipped)."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body required"}), 400

    token = data.get("face_challenge_token")
    images = data.get("images", [])

    if not token:
        return jsonify({"error": "face_challenge_token is required"}), 400

    user_id, purpose, err = _verify_face_challenge_token(token)
    if err:
        return jsonify({"error": err}), 401
    if purpose != "enrollment":
        return jsonify({"error": "Invalid token for face enrollment"}), 400

    user = User.query.get(user_id)
    if not user or user.role != "student" or not user.student:
        return jsonify({"error": "Student account not found"}), 404

    student = user.student
    min_images = current_app.config.get("FACE_MIN_IMAGES", 20)

    if len(images) < min_images:
        return jsonify({
            "error": f"Minimum {min_images} face images required. Received {len(images)}.",
            "min_images": min_images,
            "recommended_images": current_app.config.get("FACE_RECOMMENDED_IMAGES", 30),
        }), 400

    # Note: Anti-spoofing is NOT applied during enrollment.
    # Enrollment captures 25+ similar frames rapidly from one position,
    # which the temporal motion check would incorrectly flag as "static".
    # Anti-spoofing is enforced during verification (login + attendance).

    FaceEncoding.query.filter_by(student_id=student.id).delete()
    db.session.flush()

    result = register_face_encodings(student.id, images)

    if not result["success"] or result["stored_count"] < min_images:
        student.face_registration_status = "failed"
        student.face_registered = False
        db.session.commit()
        return jsonify({
            "error": (
                f"Face enrollment failed. Only {result['stored_count']} valid images captured. "
                f"Minimum {min_images} required with clear face detection."
            ),
            **result,
        }), 400

    student.face_registration_status = "registered"
    student.face_registered = True
    student.first_login_completed = True
    user.last_login = datetime.now(timezone.utc)
    db.session.commit()

    access_token, refresh_token = _issue_tokens(user)
    log_audit("face_enrollment", f"Student {user.email} completed self face enrollment ({result['stored_count']} images)")

    return jsonify({
        "message": "Face enrollment successful",
        "access_token": access_token,
        "refresh_token": refresh_token,
        "user": user.to_dict(),
        "student_id": student.id,
        "stored_count": result["stored_count"],
        "step": "complete",
    }), 201


@auth_bp.route("/verify-login-face", methods=["POST"])
def verify_login_face():
    """Step 2: Live face verification to complete student login (2FA)."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body required"}), 400

    token = data.get("face_challenge_token")
    images = data.get("images", [])
    image = data.get("image")

    if not token:
        return jsonify({"error": "face_challenge_token is required"}), 400

    if not images and image:
        images = [image]

    user_id, purpose, err = _verify_face_challenge_token(token)
    if err:
        return jsonify({"error": err}), 401
    if purpose != "verification":
        return jsonify({"error": "Invalid token for face verification"}), 400

    user = User.query.get(user_id)
    if not user or user.role != "student" or not user.student:
        return jsonify({"error": "Student account not found"}), 404

    student = user.student

    # Anti-spoofing check on login face frames
    liveness_frames = data.get("liveness_frames", images)
    spoof_result = run_antispoof_pipeline(liveness_frames)
    if not spoof_result["is_live"]:
        log_audit("spoof_detected_login", f"Spoofing detected during login for {user.email}: {spoof_result['details']}")
        return jsonify({
            "error": "Live Face Verification Failed. Photos, screenshots, printed images, and replay videos are not allowed.",
            "spoof_detected": True,
            "spoof_details": spoof_result["details"],
        }), 403

    face_result = _verify_face_frames(student.id, images)

    if not face_result["matched"]:
        log_audit(
            "login_face_failed",
            f"Face verification failed for {user.email} "
            f"(confidence: {face_result.get('confidence', 0):.2f}, "
            f"matches: {face_result.get('match_count', 0)})",
        )
        return jsonify({
            "error": "Face Verification Failed",
            "message": "Face Verification Failed",
            "confidence": face_result.get("confidence", 0),
            "accuracy_percent": round((face_result.get("confidence") or 0) * 100, 1),
            "match_count": face_result.get("match_count", 0),
            "frames_checked": face_result.get("frames_checked", 0),
            "threshold_percent": face_result.get("threshold_percent"),
        }), 403

    user.last_login = datetime.now(timezone.utc)
    if not student.first_login_completed:
        student.first_login_completed = True
    db.session.commit()

    access_token, refresh_token = _issue_tokens(user)
    log_audit(
        "login_success",
        f"Student {user.email} logged in with face 2FA "
        f"(confidence: {face_result['confidence']:.2f})",
    )

    return jsonify({
        "step": "complete",
        "message": "Login successful",
        "access_token": access_token,
        "refresh_token": refresh_token,
        "user": user.to_dict(),
        "student_id": student.id,
        "confidence": face_result["confidence"],
        "accuracy_percent": round(face_result["confidence"] * 100, 1),
        "must_change_password": user.must_change_password,
    }), 200


@auth_bp.route("/detect-face", methods=["POST"])
def detect_face_preview():
    """Preview face detection during enrollment or login (no auth required with challenge token)."""
    data = request.get_json()
    if not data or not data.get("image"):
        return jsonify({"error": "image is required"}), 400

    token = data.get("face_challenge_token")
    if token:
        user_id, _, err = _verify_face_challenge_token(token)
        if err:
            return jsonify({"error": err}), 401

    result = preview_face_detection(data["image"])
    return jsonify(result), 200


@auth_bp.route("/refresh", methods=["POST"])
@jwt_required(refresh=True)
def refresh():
    """Issue a new access token using a valid refresh token."""
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user or not user.is_active:
        return jsonify({"error": "Invalid or disabled account"}), 401

    access_token = create_access_token(
        identity=str(user.id),
        additional_claims={"role": user.role, "name": user.name},
    )

    return jsonify({"access_token": access_token}), 200


@auth_bp.route("/logout", methods=["POST"])
@jwt_required()
def logout():
    """Logout user (client-side token discard)."""
    user_id = int(get_jwt_identity())
    log_audit("logout", f"User {user_id} logged out")
    return jsonify({"message": "Logged out successfully"}), 200


@auth_bp.route("/change-password", methods=["PUT"])
@jwt_required()
def change_password():
    """Change authenticated user's password."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body required"}), 400

    missing = validate_required_fields(data, ["current_password", "new_password"])
    if missing:
        return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400

    current_password = data["current_password"]
    new_password = data["new_password"]

    if len(new_password) < 6:
        return jsonify({"error": "New password must be at least 6 characters"}), 400

    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)

    if not bcrypt.checkpw(current_password.encode("utf-8"), user.password_hash.encode("utf-8")):
        return jsonify({"error": "Current password is incorrect"}), 401

    hashed = bcrypt.hashpw(new_password.encode("utf-8"), bcrypt.gensalt())
    user.password_hash = hashed.decode("utf-8")
    user.must_change_password = False
    db.session.commit()

    log_audit("password_changed", f"User {user.email} changed their password")

    return jsonify({"message": "Password changed successfully"}), 200


@auth_bp.route("/me", methods=["GET"])
@jwt_required()
def get_current_user():
    """Get current authenticated user's profile."""
    claims = get_jwt()
    if claims.get("type") == "face_challenge":
        return jsonify({"error": "Complete face verification to access the app"}), 401

    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    data = user.to_dict()
    if user.role == "student" and user.student:
        data["student"] = user.student.to_dict()

    return jsonify(data), 200


@auth_bp.route("/profile", methods=["PUT"])
@jwt_required()
def update_profile():
    """Allow a student to update their own profile details."""
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    if user.role != "student" or not user.student:
        return jsonify({"error": "Only students can update their profile here"}), 403

    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body required"}), 400

    student = user.student

    # Updatable fields for students
    if "full_name" in data or "name" in data:
        new_name = (data.get("full_name") or data.get("name", "")).strip()
        if new_name:
            user.name = new_name

    if "email" in data:
        from app.utils.helpers import validate_email
        new_email = data["email"].strip().lower()
        if new_email and new_email != user.email:
            if not validate_email(new_email):
                return jsonify({"error": "Invalid email format"}), 400
            if User.query.filter_by(email=new_email).first():
                return jsonify({"error": "Email already in use"}), 409
            user.email = new_email

    if "gender" in data:
        student.gender = data["gender"].strip()

    db.session.commit()
    log_audit("profile_updated", f"Student {user.email} updated their profile")

    return jsonify({
        "message": "Profile updated successfully",
        "user": user.to_dict(),
        "student": student.to_dict(),
    }), 200


@auth_bp.route("/profile-photo", methods=["POST"])
@jwt_required()
def upload_profile_photo():
    """Upload profile photo with face-match validation against registered biometrics."""
    from datetime import datetime, timezone

    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    if user.role != "student" or not user.student:
        return jsonify({"error": "Only students can upload profile photos"}), 403

    student = user.student

    if not student.face_registered:
        return jsonify({"error": "You must complete face enrollment before uploading a profile photo"}), 400

    data = request.get_json()
    if not data or not data.get("image"):
        return jsonify({"error": "Image is required"}), 400

    image_b64 = data["image"]

    # Step 1: Detect face in the uploaded image
    image = decode_base64_image(image_b64)
    if image is None:
        return jsonify({"error": "Failed to decode image. Please upload a valid JPG or PNG."}), 400

    # Step 2: Compare against registered face
    result = recognize_student_face(image, student.id)

    if not result.get("face_detected"):
        return jsonify({"error": "No face detected in the uploaded image. Please upload a clear photo of your face."}), 400

    if not result.get("matched"):
        return jsonify({
            "error": "Uploaded image does not match your registered face profile.",
            "confidence": result.get("confidence", 0),
        }), 403

    # Step 3: Save as profile photo (only if face matches)
    student.profile_image = image_b64
    student.profile_image_updated_at = datetime.now(timezone.utc)
    db.session.commit()

    log_audit("profile_photo_updated", f"Student {user.email} updated their profile photo (confidence: {result.get('confidence', 0):.2f})")

    return jsonify({
        "message": "Profile photo updated successfully",
        "confidence": result.get("confidence", 0),
        "profile_image_updated_at": student.profile_image_updated_at.isoformat(),
    }), 200

