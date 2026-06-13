"""Face registration and recognition routes."""

from flask import Blueprint, request, jsonify

from app.models.student import Student
from app.models.face_encoding import FaceEncoding
from app.services.face_service import (
    recognize_face,
    decode_base64_image,
    draw_recognition_results,
    load_all_encodings,
)
from app.utils.decorators import teacher_or_admin_required
from app.extensions import db

faces_bp = Blueprint("faces", __name__, url_prefix="/api/faces")


@faces_bp.route("/register", methods=["POST"])
@teacher_or_admin_required
def register_face():
    """Teacher pre-registration is disabled — students enroll on first login."""
    return jsonify({
        "error": "Face registration by teachers is disabled. Students must enroll their face when they log in.",
    }), 403


@faces_bp.route("/recognize", methods=["POST"])
@teacher_or_admin_required
def recognize():
    """Recognize faces in a submitted frame.

    Expects JSON:
    {
        "image": base64_string,
        "session_id": int (optional — for annotation)
    }
    """
    data = request.get_json()
    if not data or "image" not in data:
        return jsonify({"error": "Image is required"}), 400

    image = decode_base64_image(data["image"])
    if image is None:
        return jsonify({"error": "Failed to decode image"}), 400

    encoding_map = load_all_encodings()

    if not encoding_map:
        return jsonify({
            "results": [],
            "message": "No face encodings registered yet",
        }), 200

    results = recognize_face(image, encoding_map)

    student_names = {}
    for r in results:
        if r["student_id"]:
            student = Student.query.get(r["student_id"])
            if student and student.user:
                student_names[r["student_id"]] = student.user.name

    annotated_image = draw_recognition_results(image, results, student_names)

    response_results = []
    for r in results:
        response_results.append({
            "student_id": r["student_id"],
            "student_name": student_names.get(r["student_id"], "Unknown"),
            "confidence": r["confidence"],
            "distance": r["distance"],
            "recognized": r["student_id"] is not None,
        })

    return jsonify({
        "results": response_results,
        "annotated_image": annotated_image,
        "face_count": len(results),
    }), 200


@faces_bp.route("/<int:student_id>", methods=["DELETE"])
@teacher_or_admin_required
def delete_encodings(student_id):
    """Delete all face encodings for a student."""
    student = Student.query.get(student_id)
    if not student:
        return jsonify({"error": "Student not found"}), 404

    count = FaceEncoding.query.filter_by(student_id=student_id).delete()
    student.face_registration_status = "pending"
    student.face_registered = False
    db.session.commit()

    return jsonify({
        "message": f"Deleted {count} face encodings for student {student_id}",
    }), 200


@faces_bp.route("/status/<int:student_id>", methods=["GET"])
@teacher_or_admin_required
def get_encoding_status(student_id):
    """Check if a student has face encodings registered."""
    student = Student.query.get(student_id)
    if not student:
        return jsonify({"error": "Student not found"}), 404

    count = FaceEncoding.query.filter_by(student_id=student_id).count()

    return jsonify({
        "student_id": student_id,
        "status": student.face_registration_status,
        "has_encodings": count > 0,
        "encoding_count": count,
    }), 200
