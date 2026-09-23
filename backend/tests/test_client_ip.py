import hashlib
import hmac
import re

from starlette.requests import Request

from app.core.client_ip import UNKNOWN_IP, client_ip, fingerprint, hash_client_ip

SECRET = "unit-test-ip-hash-secret-0123456789"


def make_request(
    headers: dict[str, str] | None = None,
    client: tuple[str, int] | None = ("9.9.9.9", 1234),
) -> Request:
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/",
        "query_string": b"",
        "headers": [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()],
        "client": client,
    }
    return Request(scope)


def test_peer_address_without_proxy() -> None:
    request = make_request({"X-Forwarded-For": "1.1.1.1, 2.2.2.2"})
    assert client_ip(request, trusted_proxy=False) == "9.9.9.9"


def test_rightmost_forwarded_entry_with_proxy() -> None:
    request = make_request({"X-Forwarded-For": "1.1.1.1, 2.2.2.2 , 203.0.113.9 "})
    assert client_ip(request, trusted_proxy=True) == "203.0.113.9"


def test_single_forwarded_entry_with_proxy() -> None:
    request = make_request({"X-Forwarded-For": "203.0.113.9"})
    assert client_ip(request, trusted_proxy=True) == "203.0.113.9"


def test_proxy_without_header_falls_back_to_peer() -> None:
    assert client_ip(make_request(), trusted_proxy=True) == "9.9.9.9"


def test_proxy_with_blank_header_falls_back_to_peer() -> None:
    request = make_request({"X-Forwarded-For": " , "})
    assert client_ip(request, trusted_proxy=True) == "9.9.9.9"


def test_unknown_when_nothing_is_available() -> None:
    assert client_ip(make_request(client=None), trusted_proxy=False) == UNKNOWN_IP
    assert client_ip(make_request(client=None), trusted_proxy=True) == UNKNOWN_IP
    assert client_ip(make_request(client=("", 0)), trusted_proxy=False) == UNKNOWN_IP


def test_ip_hash_is_a_keyed_hmac_and_hides_the_address() -> None:
    digest = hash_client_ip("203.0.113.9", SECRET)
    expected = hmac.new(SECRET.encode(), b"203.0.113.9", hashlib.sha256).hexdigest()
    assert digest == expected
    assert re.fullmatch(r"[0-9a-f]{64}", expected)
    assert "203.0.113.9" not in expected
    # Stable for the same sender, different for another one, and useless without the key.
    assert hash_client_ip("203.0.113.9", SECRET) == digest
    assert hash_client_ip("203.0.113.10", SECRET) != digest
    assert hash_client_ip("203.0.113.9", "another-secret-0123456789abcdefghij") != digest


def test_ip_hash_ignores_the_spelling_of_the_address() -> None:
    ipv4 = hash_client_ip("1.2.3.4", SECRET)
    assert hash_client_ip("::ffff:1.2.3.4", SECRET) == ipv4
    assert hash_client_ip("::FFFF:1.2.3.4", SECRET) == ipv4
    assert hash_client_ip("2001:DB8:0:0::1", SECRET) == hash_client_ip("2001:db8::1", SECRET)


def test_unknown_ip_has_no_hash() -> None:
    assert hash_client_ip(UNKNOWN_IP, SECRET) is None
    assert fingerprint(None) == "unknown"


def test_fingerprint_is_the_hash_prefix() -> None:
    digest = hash_client_ip("198.51.100.7", SECRET)
    assert digest is not None
    assert fingerprint(digest) == digest[:12]
