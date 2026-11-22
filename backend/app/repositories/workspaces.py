from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Workspace


def add(session: Session, user_id: str, config: dict[str, Any]) -> Workspace:
    """Create the user's single workspace at revision 1. ``config`` must be normalized already."""
    workspace = Workspace(user_id=user_id, config=config, revision=1)
    session.add(workspace)
    session.flush()
    return workspace


def get_for_user(session: Session, user_id: str) -> Workspace | None:
    """Ownership is always by session-derived user id, never by a client-supplied one."""
    return session.scalar(select(Workspace).where(Workspace.user_id == user_id))
