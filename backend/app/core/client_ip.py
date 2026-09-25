"""Client IP resolution and the one-way hash that is all the backend ever keeps of it.

The raw IP is used in memory only (rate-limit keys, as `rate_limit_subject`, and Turnstile's
`remoteip`). What is stored on a
contact message, written into the notification email or logged is `hash_client_ip`: an HMAC keyed
with `IP_HASH_SECRET`, so repeat senders can be recognised without the address being recoverable.
"""

import hashlib
import hmac
import ipaddress

from fastapi import Request

UNKNOWN_IP = "unknown"
FINGERPRINT_LENGTH = 12
"""Hex characters of the hash shown in emails and logs: enough to tell senders apart at a glance."""


def client_ip(request: Request, *, trusted_proxy: bool) -> str:
    """The caller's IP.

    With `trusted_proxy`, the rightmost `X-Forwarded-For` entry wins (the one the reverse proxy
    appends; earlier entries are attacker-controlled). Otherwise the transport peer address is
    used. Falls back to the literal `unknown` when neither is available.
    """
    if trusted_proxy:
        forwarded = request.headers.get("x-forwarded-for", "")
        rightmost = forwarded.rsplit(",", 1)[-1].strip()
        if rightmost:
            return rightmost
    if request.client is not None and request.client.host:
        return request.client.host
    return UNKNOWN_IP


def _canonical(ip: str) -> str:
    """One spelling per address: `::FFFF:1.2.3.4`, `::ffff:1.2.3.4` and `1.2.3.4` hash alike."""
    try:
        address = ipaddress.ip_address(ip)
    except ValueError:
        return ip
    if isinstance(address, ipaddress.IPv6Address) and address.ipv4_mapped is not None:
        return str(address.ipv4_mapped)
    return address.compressed


IPV6_SUBJECT_PREFIX = 64
"""IPv6 rate limits count per /64: one subscriber usually holds a whole /64 and could otherwise
rotate addresses inside it without limit (behind Cloudflare, visitors arrive over IPv6 too)."""


def rate_limit_subject(ip: str) -> str:
    """Who a rate limit counts: the IPv4 address, or the /64 network of an IPv6 address."""
    try:
        address = ipaddress.ip_address(ip)
    except ValueError:
        return ip  # `unknown`, or something the proxy should never send: counted as given
    if isinstance(address, ipaddress.IPv6Address):
        if address.ipv4_mapped is not None:
            return str(address.ipv4_mapped)
        return ipaddress.ip_network(f"{address}/{IPV6_SUBJECT_PREFIX}", strict=False).compressed
    return address.compressed


def hash_client_ip(ip: str, secret: str) -> str | None:
    """HMAC-SHA256 of the canonical IP as 64 hex characters; None when the IP is unknown."""
    if ip == UNKNOWN_IP:
        return None
    digest = hmac.new(secret.encode("utf-8"), _canonical(ip).encode("utf-8"), hashlib.sha256)
    return digest.hexdigest()


def fingerprint(ip_hash: str | None) -> str:
    """The short, human-readable form of an IP hash for emails and logs."""
    return ip_hash[:FINGERPRINT_LENGTH] if ip_hash else "unknown"
