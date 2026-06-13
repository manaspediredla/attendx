"""Configurable CSV column mapping for student imports.

Update HEADER_ALIASES and REQUIRED_FIELDS here when the CSV structure changes.
Import logic in csv_service.py reads from this module only.
"""

# Canonical internal field names
STUDENT_FIELDS = [
    "id",
    "full_name",
    "email",
    "gender",
    "college_name",
    "city_name",
    "department",
    "section",
]

# Fields that must be present and non-empty in every CSV row
REQUIRED_FIELDS = [
    "id",
    "full_name",
    "email",
    "gender",
    "college_name",
    "city_name",
    "department",
    "section",
]

# Map normalized CSV header text -> canonical field name
HEADER_ALIASES = {
    "id": "id",
    "roll no": "id",
    "roll_no": "id",
    "roll number": "id",
    "rollnumber": "id",
    "roll_number": "id",
    "student id": "id",
    "student_id": "id",
    "full_name": "full_name",
    "full name": "full_name",
    "name": "full_name",
    "student_name": "full_name",
    "student name": "full_name",
    "email": "email",
    "email address": "email",
    "email_address": "email",
    "gender": "gender",
    "sex": "gender",
    "college_name": "college_name",
    "college name": "college_name",
    "college": "college_name",
    "institution": "college_name",
    "campus_name": "college_name",
    "campus name": "college_name",
    "campus": "college_name",
    "city_name": "city_name",
    "city name": "city_name",
    "city": "city_name",
    "department": "department",
    "dept": "department",
    "section": "section",
    "sec": "section",
}
