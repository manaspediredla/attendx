"""Validation service — GPS and network validation for attendance."""

import math
import ipaddress

from app.models.allowed_location import AllowedLocation
from app.models.allowed_network import AllowedNetwork
from app.utils.request_helpers import is_private_or_local_ip


def haversine_distance(lat1, lon1, lat2, lon2):
    """Calculate the Haversine distance between two GPS coordinates."""
    R = 6371000  # Earth radius in meters

    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (math.sin(delta_phi / 2) ** 2 +
         math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return R * c


def _ip_matches(entry, ip_str):
    """Check if an IP matches an exact address or CIDR range."""
    if not entry or not ip_str:
        return False

    entry = entry.strip()
    try:
        if "/" in entry:
            return ipaddress.ip_address(ip_str) in ipaddress.ip_network(entry, strict=False)
        return ip_str == entry
    except ValueError:
        return False


def validate_gps(latitude, longitude):
    """Check if the given coordinates fall within any approved GPS location."""
    if latitude is None or longitude is None:
        return {
            "validated": False,
            "reason": "GPS coordinates not provided",
            "matched_location": None,
        }

    try:
        latitude = float(latitude)
        longitude = float(longitude)
    except (TypeError, ValueError):
        return {
            "validated": False,
            "reason": "Invalid GPS coordinates",
            "matched_location": None,
        }

    locations = AllowedLocation.query.filter_by(is_active=True).all()

    if not locations:
        return {
            "validated": True,
            "reason": "No GPS restrictions configured",
            "matched_location": None,
        }

    closest = None
    closest_distance = None

    for location in locations:
        distance = haversine_distance(
            latitude, longitude,
            location.latitude, location.longitude,
        )

        if closest_distance is None or distance < closest_distance:
            closest_distance = distance
            closest = location

        if distance <= location.radius_meters:
            return {
                "validated": True,
                "reason": f"Within {location.name} ({distance:.0f}m / {location.radius_meters}m radius)",
                "matched_location": location.name,
                "campus_name": location.name,
                "city_name": location.city_name,
                "distance_meters": round(distance, 1),
            }

    if closest:
        return {
            "validated": False,
            "reason": (
                f"Location is outside all approved campus areas. "
                f"Nearest: {closest.name} ({closest_distance:.0f}m away, allowed {closest.radius_meters}m)"
            ),
            "matched_location": None,
            "nearest_location": closest.name,
            "distance_meters": round(closest_distance, 1),
            "allowed_radius_meters": closest.radius_meters,
        }

    return {
        "validated": False,
        "reason": "Location is outside all approved campus areas",
        "matched_location": None,
    }


def validate_network(client_ip, reported_public_ip=None):
    """Check if the client IP matches any approved network.

    When the server sees a private/loopback IP (local dev or LAN), also checks
    the client's reported public IP so same-WiFi users can match a configured
    public IP address.
    """
    ips_to_check = []

    if client_ip:
        ips_to_check.append(client_ip)

    if reported_public_ip:
        reported_public_ip = str(reported_public_ip).strip()
        if reported_public_ip and reported_public_ip not in ips_to_check:
            ips_to_check.append(reported_public_ip)

    if not ips_to_check:
        return {
            "validated": False,
            "reason": "Client IP not provided",
            "matched_network": None,
            "checked_ips": [],
        }

    networks = AllowedNetwork.query.filter_by(is_active=True).all()

    if not networks:
        return {
            "validated": True,
            "reason": "No network restrictions configured",
            "matched_network": None,
            "checked_ips": ips_to_check,
        }

    for network in networks:
        for ip in ips_to_check:
            if _ip_matches(network.public_ip, ip):
                return {
                    "validated": True,
                    "reason": f"Connected to {network.name}",
                    "matched_network": network.name,
                    "matched_ip": ip,
                    "checked_ips": ips_to_check,
                }

            if _ip_matches(network.vpn_range, ip):
                return {
                    "validated": True,
                    "reason": f"Connected via {network.name}",
                    "matched_network": network.name,
                    "matched_ip": ip,
                    "checked_ips": ips_to_check,
                }

    using_local = client_ip and is_private_or_local_ip(client_ip)
    hint = (
        " On local/LAN access, add your public IP (detected below) or a local range "
        "like 192.168.0.0/16 in VPN Range."
        if using_local
        else ""
    )

    return {
        "validated": False,
        "reason": f"Not connected to an approved network.{hint}",
        "matched_network": None,
        "checked_ips": ips_to_check,
        "server_seen_ip": client_ip,
        "reported_public_ip": reported_public_ip,
    }


def get_validation_status(latitude, longitude, client_ip, reported_public_ip=None):
    """Run both GPS and network validation."""
    gps_result = validate_gps(latitude, longitude)
    network_result = validate_network(client_ip, reported_public_ip)

    return {
        "gps": gps_result,
        "network": network_result,
        "all_valid": gps_result["validated"] and network_result["validated"],
    }
