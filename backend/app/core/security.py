import hashlib
import hmac
import secrets


def new_token() -> str:
    """32 random bytes, URL-safe. Used for both the session cookie and the CSRF token."""
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    """SHA-256 hex digest; only this is stored server-side for session tokens."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def tokens_match(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))
