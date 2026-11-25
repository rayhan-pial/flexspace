from datetime import UTC, datetime
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.db.models import Template


def get_by_system_key(session: Session, system_key: str) -> Template | None:
    return session.scalar(select(Template).where(Template.system_key == system_key))


def add_system(session: Session, system_key: str, name: str, config: dict[str, Any]) -> Template:
    template = Template(system_key=system_key, owner_id=None, name=name, config=config)
    session.add(template)
    session.flush()
    return template


def update_system(session: Session, template: Template, name: str, config: dict[str, Any]) -> Template:
    """Rewrite a system template in place (same id). Custom templates are never passed here."""
    if template.system_key is None or template.owner_id is not None:
        raise ValueError("Only system templates can be rewritten this way.")
    template.name = name
    template.config = config
    template.updated_at = datetime.now(UTC)
    session.flush()
    return template


def _visible_to(user_id: str):
    """System rows (no owner) plus the caller's own; never another user's."""
    return or_(Template.owner_id.is_(None), Template.owner_id == user_id)


def list_visible(session: Session, user_id: str) -> list[Template]:
    """Visible templates, newest first by ``created_at``.

    Equal timestamps are possible (a coarse clock, or rows created in one transaction), so ties are broken by
    ``id`` ascending. That makes the order deterministic and repeatable; it is *not* insertion order, because ids
    are random UUIDs. Callers that need system templates in their documented order sort those themselves.
    """
    statement = select(Template).where(_visible_to(user_id)).order_by(Template.created_at.desc(), Template.id.asc())
    return list(session.scalars(statement))


def get_visible(session: Session, template_id: str, user_id: str) -> Template | None:
    return session.scalar(select(Template).where(Template.id == template_id, _visible_to(user_id)))


def add_custom(session: Session, owner_id: str, name: str, config: dict[str, Any]) -> Template:
    template = Template(owner_id=owner_id, system_key=None, name=name, config=config)
    session.add(template)
    session.flush()
    return template


def remove(session: Session, template: Template) -> None:
    session.delete(template)
    session.flush()
