from datetime import datetime
from typing import Any

from sqlalchemy import select, update
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


def save_if_revision(
    session: Session, user_id: str, base_revision: int, config: dict[str, Any], now: datetime
) -> bool:
    """Atomic compare-and-swap: write the whole config and bump the revision only if the
    caller's user still has ``base_revision``. Returns False (nothing written) otherwise."""
    result = session.execute(
        update(Workspace)
        .where(Workspace.user_id == user_id, Workspace.revision == base_revision)
        .values(config=config, revision=Workspace.revision + 1, updated_at=now)
    )
    return result.rowcount == 1
