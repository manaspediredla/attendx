"""System setting model for institution-wide configuration."""

from datetime import datetime, timezone
from app.extensions import db


class SystemSetting(db.Model):
    """Key-value store for institution-wide settings."""

    __tablename__ = "system_settings"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    key = db.Column(db.String(100), unique=True, nullable=False, index=True)
    value = db.Column(db.Text, nullable=True)
    description = db.Column(db.String(500), nullable=True)
    updated_at = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
    updated_by = db.Column(
        db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    @staticmethod
    def get_value(key, default=None):
        """Get a setting value by key, returning default if not found."""
        setting = SystemSetting.query.filter_by(key=key).first()
        return setting.value if setting else default

    @staticmethod
    def set_value(key, value, description=None, user_id=None):
        """Set a setting value, creating it if it doesn't exist."""
        setting = SystemSetting.query.filter_by(key=key).first()
        if setting:
            setting.value = value
            if description:
                setting.description = description
            setting.updated_by = user_id
        else:
            setting = SystemSetting(
                key=key,
                value=value,
                description=description,
                updated_by=user_id,
            )
            db.session.add(setting)
        db.session.commit()
        return setting

    def to_dict(self):
        """Serialize setting to dictionary."""
        return {
            "id": self.id,
            "key": self.key,
            "value": self.value,
            "description": self.description,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
