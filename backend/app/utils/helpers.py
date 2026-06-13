"""Utility helper functions."""

import re


def validate_email(email):
    """Validate email format."""
    pattern = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
    return re.match(pattern, email) is not None


def validate_required_fields(data, fields):
    """Check that all required fields are present and non-empty in data dict.

    Returns a list of missing field names, or empty list if all present.
    """
    missing = []
    for field in fields:
        if field not in data or data[field] is None or str(data[field]).strip() == "":
            missing.append(field)
    return missing
