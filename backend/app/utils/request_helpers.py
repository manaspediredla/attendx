"""HTTP request helper utilities."""

import ipaddress


def normalize_ip(ip_str):
    """Normalize an IP string, taking the first address from X-Forwarded-For."""
    if not ip_str:
        return None

    ip_str = str(ip_str).split(",")[0].strip()
    if not ip_str:
        return None

    try:
        return str(ipaddress.ip_address(ip_str))
    except ValueError:
        return None


def get_client_ip(request):
    """Extract the best available client IP from a Flask request."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        normalized = normalize_ip(forwarded)
        if normalized:
            return normalized

    return normalize_ip(request.remote_addr)


def is_private_or_local_ip(ip_str):
    """Return True for loopback, link-local, or RFC1918 addresses."""
    if not ip_str:
        return False

    try:
        ip = ipaddress.ip_address(ip_str)
        return ip.is_private or ip.is_loopback or ip.is_link_local
    except ValueError:
        return False
