"""Clear all student face data so students re-enroll on next login.

Run from backend/:  python reset_face_data.py
"""

from dotenv import load_dotenv

load_dotenv()

from app import create_app
from app.migrate import reset_student_face_data


def main():
    app = create_app()
    with app.app_context():
        encodings_cleared, students_reset = reset_student_face_data()
        print(f"Cleared {encodings_cleared} face encodings for {students_reset} students.")
        print("Students will enroll their face on next login.")


if __name__ == "__main__":
    main()
