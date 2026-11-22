from sqlalchemy.orm import Session

from app.repositories import templates
from app.services.starter_templates import SYSTEM_TEMPLATE_NAMES, starter_config


def seed_system_templates(session: Session) -> int:
    """Insert any missing system template by ``system_key``; returns how many were inserted.

    Existing rows are left untouched (FS-024 adds deliberate by-key content updates).
    The caller commits.
    """
    inserted = 0
    for key, name in SYSTEM_TEMPLATE_NAMES.items():
        if templates.get_by_system_key(session, key) is None:
            templates.add_system(session, key, name, starter_config(key))
            inserted += 1
    return inserted
