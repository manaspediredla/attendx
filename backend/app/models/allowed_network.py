"""Allowed network model for WiFi/IP validation."""

from datetime import datetime, timezone
from app.extensions import db


class AllowedNetwork(db.Model):
    """Stores approved networks (WiFi SSIDs, public IPs, VPN ranges)."""

    __tablename__ = "allowed_networks"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    name = db.Column(db.String(200), nullable=False)
    ssid = db.Column(db.String(100), nullable=True)
    public_ip = db.Column(db.String(45), nullable=True)
    vpn_range = db.Column(db.String(50), nullable=True)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    created_at = db.Column(
        db.DateTime, default=lambda: datetime.now(timezone.utc)
    )

    def to_dict(self):
        """Serialize network to dictionary."""
        return {
            "id": self.id,
            "name": self.name,
            "ssid": self.ssid,
            "public_ip": self.public_ip,
            "vpn_range": self.vpn_range,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
