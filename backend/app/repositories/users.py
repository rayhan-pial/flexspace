from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import User


def add(session: Session, email: str, password_hash: str) -> User:
    """Insert a user (email must already be normalized). Flushes; the caller owns the transaction."""
    user = User(email=email, password_hash=password_hash)
    session.add(user)
    session.flush()
    return user


def get_by_email(session: Session, email: str) -> User | None:
    return session.scalar(select(User).where(User.email == email))


def get_by_id(session: Session, user_id: str) -> User | None:
    return session.get(User, user_id)
