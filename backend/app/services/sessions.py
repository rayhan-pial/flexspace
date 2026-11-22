"""Opaque server-side sessions. The cookie holds a random token; the database holds its hash."""

from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from app.core.security import hash_token, new_token
from app.db.models import UserSession
from app.repositories import sessions as repo


def start_session(db: Session, user_id: str, ttl_hours: int, now: datetime | None = None) -> tuple[str, UserSession]:
    """Create a session with a fresh token and CSRF token (never reuses a prior token); commits.

    Returns ``(raw_token, row)``; the raw token goes only into the cookie.
    """
    now = now or datetime.now(UTC)
    repo.delete_expired(db, now)
    token = new_token()
    row = repo.add(db, hash_token(token), user_id, new_token(), now + timedelta(hours=ttl_hours))
    db.commit()
    return token, row


def resolve(db: Session, token: str, now: datetime | None = None) -> UserSession | None:
    """Return the live session for a cookie token; an expired one is deleted and treated as absent."""
    now = now or datetime.now(UTC)
    row = repo.get_by_hash(db, hash_token(token))
    if row is None:
        return None
    if row.expires_at <= now:
        repo.delete_by_hash(db, row.token_hash)
        db.commit()
        return None
    return row


def revoke(db: Session, token: str) -> None:
    repo.delete_by_hash(db, hash_token(token))
    db.commit()
