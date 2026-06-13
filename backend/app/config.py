"""Application configuration loaded from environment variables."""

import os
from datetime import timedelta
from urllib.parse import quote_plus
from dotenv import load_dotenv

load_dotenv()


class Config:
    """Base configuration."""

    # Flask
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key")
    DEBUG = False

    # Database — supports DATABASE_URL (cloud hosts) or individual vars (local MySQL)
    DB_HOST = os.getenv("DB_HOST", "localhost")
    DB_PORT = os.getenv("DB_PORT", "3306")
    DB_USER = os.getenv("DB_USER", "root")
    DB_PASSWORD = os.getenv("DB_PASSWORD", "")
    DB_NAME = os.getenv("DB_NAME", "attendance_db")

    # Use DATABASE_URL if provided (Render, Railway, etc.), else build MySQL URI
    SQLALCHEMY_DATABASE_URI = os.getenv(
        "DATABASE_URL",
        f"mysql+pymysql://{DB_USER}:{quote_plus(DB_PASSWORD)}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # JWT
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "jwt-dev-secret")
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(
        seconds=int(os.getenv("JWT_ACCESS_TOKEN_EXPIRES", "86400"))
    )
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(
        seconds=int(os.getenv("JWT_REFRESH_TOKEN_EXPIRES", "604800"))
    )
    JWT_TOKEN_LOCATION = ["headers"]
    JWT_HEADER_NAME = "Authorization"
    JWT_HEADER_TYPE = "Bearer"

    # Mail
    MAIL_SERVER = os.getenv("MAIL_SERVER", "smtp.gmail.com")
    MAIL_PORT = int(os.getenv("MAIL_PORT", "587"))
    MAIL_USE_TLS = os.getenv("MAIL_USE_TLS", "True").lower() == "true"
    MAIL_USERNAME = os.getenv("MAIL_USERNAME", "")
    MAIL_PASSWORD = os.getenv("MAIL_PASSWORD", "")
    MAIL_DEFAULT_SENDER = os.getenv("MAIL_DEFAULT_SENDER", "")

    # Face Recognition
    FACE_RECOGNITION_TOLERANCE = float(
        os.getenv("FACE_RECOGNITION_TOLERANCE", "0.55")
    )
    FACE_MIN_MATCH_VOTES = int(os.getenv("FACE_MIN_MATCH_VOTES", "2"))
    FACE_CAPTURE_COUNT = int(os.getenv("FACE_CAPTURE_COUNT", "40"))
    FACE_MIN_IMAGES = int(os.getenv("FACE_MIN_IMAGES", "20"))
    FACE_RECOMMENDED_IMAGES = int(os.getenv("FACE_RECOMMENDED_IMAGES", "30"))
    FACE_LOGIN_MIN_FRAMES = int(os.getenv("FACE_LOGIN_MIN_FRAMES", "3"))

    # Default Passwords
    DEFAULT_STUDENT_PASSWORD = os.getenv("DEFAULT_STUDENT_PASSWORD", "Institution@123")
    DEFAULT_TEACHER_PASSWORD = os.getenv("DEFAULT_TEACHER_PASSWORD", "Faculty@123")

    # Super Admin IP Whitelist (comma-separated)
    SUPER_ADMIN_WHITELISTED_IPS = os.getenv("SUPER_ADMIN_WHITELISTED_IPS", "127.0.0.1,::1")

    # Attendance
    ATTENDANCE_MIN_PERCENTAGE = float(os.getenv("ATTENDANCE_MIN_PERCENTAGE", "75.0"))


class DevelopmentConfig(Config):
    """Development configuration."""

    DEBUG = True


class ProductionConfig(Config):
    """Production configuration."""

    DEBUG = False


config_by_name = {
    "development": DevelopmentConfig,
    "production": ProductionConfig,
}
