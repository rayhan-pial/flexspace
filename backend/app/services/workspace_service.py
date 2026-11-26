"""Reading and conditionally saving a user's workspace."""

import json
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.orm import Session

from app.db.models import Workspace
from app.repositories import workspaces
from app.services import images_service
from app.services.workspace_config import normalize_config

MAX_CONFIG_BYTES = 1024 * 1024  # 1 MiB serialized (docs/architecture.md section 3)


class WorkspaceMissing(Exception):
    pass


class ConfigTooLarge(Exception):
    pass


class RevisionConflict(Exception):
    def __init__(self, current_revision: int):
        super().__init__(f"current revision is {current_revision}")
        self.current_revision = current_revision


def serialized_size(config: Any) -> int:
    return len(json.dumps(config, separators=(",", ":"), ensure_ascii=False).encode("utf-8"))


def load_workspace(db: Session, user_id: str) -> tuple[Workspace, dict[str, Any]]:
    """Return the user's row and its config normalized/migrated *in memory* (storage untouched).

    Raises InvalidConfig / UnsupportedSchemaVersion if the stored document cannot be read.
    """
    workspace = workspaces.get_for_user(db, user_id)
    if workspace is None:
        raise WorkspaceMissing()
    return workspace, normalize_config(workspace.config)


def save_workspace(db: Session, user_id: str, base_revision: int, raw_config: Any) -> tuple[Workspace, dict[str, Any]]:
    """Validate, then write only if ``base_revision`` is still current; commits.

    Raises ConfigTooLarge, InvalidConfig, UnsupportedSchemaVersion, RevisionConflict or
    WorkspaceMissing. Whenever it raises, storage is unchanged.
    """
    if serialized_size(raw_config) > MAX_CONFIG_BYTES:
        raise ConfigTooLarge()
    config = normalize_config(raw_config)  # canonical document, defaults filled
    try:
        if not workspaces.save_if_revision(db, user_id, base_revision, config, datetime.now(UTC)):
            current = workspaces.get_for_user(db, user_id)
            if current is None:
                raise WorkspaceMissing()
            raise RevisionConflict(current.revision)
        db.commit()
    except BaseException:
        db.rollback()
        raise
    db.expire_all()  # the bulk UPDATE bypassed the identity map; reload revision/timestamps
    _tidy_images(db, user_id)
    workspace = workspaces.get_for_user(db, user_id)
    return workspace, config


def _tidy_images(db: Session, user_id: str) -> None:
    """Housekeeping after a successful save: drop old uploads nothing uses. Never fails the save."""
    try:
        images_service.prune_unreferenced(db, user_id)
    except Exception:  # noqa: BLE001 - the save already succeeded; leftovers are pruned next time
        db.rollback()
