import hashlib
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import VerificationError

_ph = PasswordHasher()


def hash_password(password: str) -> str:
    return _ph.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _ph.verify(password_hash, password)
    except VerificationError:
        return False


def generate_session_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    """Deterministic hash for storing/looking up session tokens (not a password)."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
