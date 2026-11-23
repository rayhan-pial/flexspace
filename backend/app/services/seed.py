from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.repositories import templates
from app.services.starter_templates import SYSTEM_TEMPLATE_NAMES, starter_config


def seed_system_templates(session: Session) -> int:
    """Insert any missing system template by ``system_key``; returns how many were inserted.

    Existing rows are left untouched. The caller commits.
    """
    inserted = 0
    for key, name in SYSTEM_TEMPLATE_NAMES.items():
        if templates.get_by_system_key(session, key) is None:
            templates.add_system(session, key, name, starter_config(key))
            inserted += 1
    return inserted


@dataclass(frozen=True)
class SyncResult:
    inserted: int
    updated: int

    @property
    def written(self) -> int:
        return self.inserted + self.updated


def sync_system_templates(session: Session) -> SyncResult:
    """Make the stored system templates match the curated designs in code, matched by ``system_key``.

    Missing rows are inserted and rows whose name or content differs are updated in place (the row
    keeps its id, so a client that listed templates earlier still resolves it). Only rows that carry a
    ``system_key`` are ever touched: user workspaces and private custom templates are never read or
    written here, so a deploy that improves a design cannot alter anyone's saved work. Re-running it
    changes nothing. The caller commits.
    """
    inserted = 0
    updated = 0
    for key, name in SYSTEM_TEMPLATE_NAMES.items():
        wanted = starter_config(key)
        row = templates.get_by_system_key(session, key)
        if row is None:
            templates.add_system(session, key, name, wanted)
            inserted += 1
        elif row.name != name or row.config != wanted:
            templates.update_system(session, row, name, wanted)
            updated += 1
    return SyncResult(inserted=inserted, updated=updated)
