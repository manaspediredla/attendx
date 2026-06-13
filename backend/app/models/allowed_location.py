"""Allowed GPS location model for campus and approved centers."""

from datetime import datetime, timezone
from app.extensions import db


class AllowedLocation(db.Model):
    """Stores approved GPS locations where attendance can be marked."""

    __tablename__ = "allowed_locations"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    name = db.Column(db.String(200), nullable=False)
    city_name = db.Column(db.String(100), nullable=True)
    latitude = db.Column(db.Float, nullable=False)
    longitude = db.Column(db.Float, nullable=False)
    radius_meters = db.Column(db.Integer, nullable=False, default=250)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    created_at = db.Column(
        db.DateTime, default=lambda: datetime.now(timezone.utc)
    )

    def to_dict(self):
        """Serialize location to dictionary."""
        return {
            "id": self.id,
            "name": self.name,
            "city_name": self.city_name,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "radius_meters": self.radius_meters,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
