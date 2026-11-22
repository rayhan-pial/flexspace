from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Template


def get_by_system_key(session: Session, system_key: str) -> Template | None:
    return session.scalar(select(Template).where(Template.system_key == system_key))


def add_system(session: Session, system_key: str, name: str, config: dict[str, Any]) -> Template:
    template = Template(system_key=system_key, owner_id=None, name=name, config=config)
    session.add(template)
    session.flush()
    return template
