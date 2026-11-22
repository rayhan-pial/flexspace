from datetime import datetime

from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.db.models import UserSession


def add(session: Session, token_hash: str, user_id: str, csrf_token: str, expires_at: datetime) -> UserSession:
    row = UserSession(token_hash=token_hash, user_id=user_id, csrf_token=csrf_token, expires_at=expires_at)
    session.add(row)
    session.flush()
    return row


def get_by_hash(session: Session, token_hash: str) -> UserSession | None:
    return session.get(UserSession, token_hash)


def delete_by_hash(session: Session, token_hash: str) -> None:
    session.execute(delete(UserSession).where(UserSession.token_hash == token_hash))


def delete_expired(session: Session, now: datetime) -> int:
    return session.execute(delete(UserSession).where(UserSession.expires_at <= now)).rowcount
