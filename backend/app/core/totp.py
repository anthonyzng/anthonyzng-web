"""Time-based one-time passwords (RFC 6238) for the admin's second factor, and their secrets'
encryption at rest.

Codes are the authenticator-app standard: HMAC-SHA1, 6 digits, a 30-second step, a secret of
20 random bytes shown as unpadded base32. A code is accepted for the current step and one step
either side (clock drift), and only for a step later than the last one accepted, so a code
cannot be used twice.

The secret is stored encrypted with AES-256-GCM under a key derived (HKDF-SHA256) from
`TOTP_ENCRYPTION_KEY`, bound to the admin row by the associated data: a copy of the database or
of a backup alone does not reveal it, and a ciphertext moved to another row does not decrypt.
"""

import base64
import hmac
import secrets
import struct
import time
from urllib.parse import quote, urlencode

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

TOTP_ISSUER = "owwsolution.com"
TOTP_DIGITS = 6
TOTP_PERIOD_SECONDS = 30
TOTP_SECRET_BYTES = 20
TOTP_DRIFT_STEPS = 1
"""Steps accepted either side of the current one."""
CODE_PATTERN = r"^[0-9]{6}$"

CIPHERTEXT_VERSION = b"\x01"
NONCE_BYTES = 12
_KDF_INFO = b"anthonyzng-web admin TOTP secret v1"


def new_secret() -> str:
    """A fresh secret, as the base32 text an authenticator app takes."""
    return base64.b32encode(secrets.token_bytes(TOTP_SECRET_BYTES)).decode("ascii").rstrip("=")


def _secret_bytes(secret: str) -> bytes:
    padded = secret.upper() + "=" * (-len(secret) % 8)
    return base64.b32decode(padded)


def code_at(secret: str, counter: int) -> str:
    """The code for time step `counter` (RFC 4226 HOTP with dynamic truncation)."""
    digest = hmac.digest(_secret_bytes(secret), struct.pack(">Q", counter), "sha1")
    offset = digest[-1] & 0x0F
    value = struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF
    return str(value % 10**TOTP_DIGITS).zfill(TOTP_DIGITS)


def current_counter(now: float | None = None) -> int:
    return int((time.time() if now is None else now) // TOTP_PERIOD_SECONDS)


def match_code(
    secret: str, code: str, *, last_counter: int | None, now: float | None = None
) -> int | None:
    """The time step `code` belongs to, or None when it matches no step within the drift window
    or only a step at or before `last_counter` (already used)."""
    if len(code) != TOTP_DIGITS or not code.isascii() or not code.isdigit():
        return None
    centre = current_counter(now)
    matched: int | None = None
    # Every candidate is compared (constant work), the latest match wins.
    for counter in range(centre - TOTP_DRIFT_STEPS, centre + TOTP_DRIFT_STEPS + 1):
        if hmac.compare_digest(code_at(secret, counter), code):
            matched = counter
    if matched is None or (last_counter is not None and matched <= last_counter):
        return None
    return matched


def provisioning_uri(secret: str, account: str) -> str:
    """The `otpauth://` URI an authenticator app reads from the QR code."""
    label = quote(f"{TOTP_ISSUER}:{account}", safe="@:")
    query = urlencode(
        {
            "secret": secret,
            "issuer": TOTP_ISSUER,
            "algorithm": "SHA1",
            "digits": TOTP_DIGITS,
            "period": TOTP_PERIOD_SECONDS,
        }
    )
    return f"otpauth://totp/{label}?{query}"


class SecretDecryptionError(Exception):
    """The stored secret does not decrypt: another `TOTP_ENCRYPTION_KEY`, or damaged data."""


class SecretBox:
    """AES-256-GCM for TOTP secrets, keyed from `TOTP_ENCRYPTION_KEY`."""

    def __init__(self, key_material: str) -> None:
        key = HKDF(algorithm=hashes.SHA256(), length=32, salt=None, info=_KDF_INFO).derive(
            key_material.encode("utf-8")
        )
        self._aead = AESGCM(key)

    @staticmethod
    def _associated_data(admin_id: int) -> bytes:
        return f"admin_users:{admin_id}:totp".encode("ascii")

    def encrypt(self, secret: str, *, admin_id: int) -> bytes:
        """`version || nonce || ciphertext+tag`."""
        nonce = secrets.token_bytes(NONCE_BYTES)
        sealed = self._aead.encrypt(nonce, secret.encode("ascii"), self._associated_data(admin_id))
        return CIPHERTEXT_VERSION + nonce + sealed

    def decrypt(self, blob: bytes, *, admin_id: int) -> str:
        if blob[:1] != CIPHERTEXT_VERSION or len(blob) <= 1 + NONCE_BYTES:
            raise SecretDecryptionError("unknown ciphertext format")
        nonce, sealed = blob[1 : 1 + NONCE_BYTES], blob[1 + NONCE_BYTES :]
        try:
            plain = self._aead.decrypt(nonce, sealed, self._associated_data(admin_id))
        except InvalidTag as exc:
            raise SecretDecryptionError("the secret does not decrypt with this key") from exc
        return plain.decode("ascii")
