"""Private template operations. The owner always comes from the session, never from a request."""

from typing import Any

from sqlalchemy.orm import Session

from app.db.models import Template
from app.repositories import templates
from app.services.starter_templates import SYSTEM_TEMPLATE_NAMES
from app.services.workspace_config import normalize_config
from app.services.workspace_service import MAX_CONFIG_BYTES, ConfigTooLarge, serialized_size


class TemplateNotFound(Exception):
    """Missing, or owned by someone else (deliberately indistinguishable)."""


class SystemTemplateReadOnly(Exception):
    pass


def kind_of(template: Template) -> str:
    return "system" if template.system_key is not None else "custom"


def list_templates(db: Session, user_id: str) -> list[Template]:
    """System templates in their documented order, then the caller's own, newest first."""
    order = {key: n for n, key in enumerate(SYSTEM_TEMPLATE_NAMES)}
    visible = templates.list_visible(db, user_id)  # already newest first
    system = sorted((t for t in visible if t.system_key is not None), key=lambda t: order.get(t.system_key, len(order)))
    return system + [t for t in visible if t.system_key is None]


def get_template(db: Session, user_id: str, template_id: str) -> tuple[Template, dict[str, Any]]:
    """Return the template and its config normalized in memory (storage untouched)."""
    template = templates.get_visible(db, template_id, user_id)
    if template is None:
        raise TemplateNotFound()
    return template, normalize_config(template.config)


def create_template(db: Session, user_id: str, name: str, raw_config: Any) -> tuple[Template, dict[str, Any]]:
    """Snapshot ``raw_config`` as a private template; commits. The user's workspace is never touched."""
    if serialized_size(raw_config) > MAX_CONFIG_BYTES:
        raise ConfigTooLarge()
    config = normalize_config(raw_config)
    try:
        template = templates.add_custom(db, user_id, name, config)
        db.commit()
    except BaseException:
        db.rollback()
        raise
    return template, config


def delete_template(db: Session, user_id: str, template_id: str) -> None:
    template = templates.get_visible(db, template_id, user_id)
    if template is None:
        raise TemplateNotFound()
    if template.system_key is not None:
        raise SystemTemplateReadOnly()
    try:
        templates.remove(db, template)
        db.commit()
    except BaseException:
        db.rollback()
        raise
