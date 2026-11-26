from datetime import datetime

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.db.models import Image


def add(session: Session, owner_id: str, content_type: str, data: bytes) -> Image:
    image = Image(owner_id=owner_id, content_type=content_type, size=len(data), data=data)
    session.add(image)
    session.flush()
    return image


def get_owned(session: Session, image_id: str, owner_id: str) -> Image | None:
    """Only the owner can read an image; anyone else gets None (the route answers 404)."""
    return session.scalar(select(Image).where(Image.id == image_id, Image.owner_id == owner_id))


def usage(session: Session, owner_id: str) -> tuple[int, int]:
    """(count, total bytes) of the owner's images."""
    count, total = session.execute(
        select(func.count(Image.id), func.coalesce(func.sum(Image.size), 0)).where(Image.owner_id == owner_id)
    ).one()
    return int(count), int(total)


def ids_older_than(session: Session, owner_id: str, cutoff: datetime) -> list[str]:
    return list(session.scalars(select(Image.id).where(Image.owner_id == owner_id, Image.created_at < cutoff)))


def delete_ids(session: Session, owner_id: str, ids: list[str]) -> int:
    if not ids:
        return 0
    return session.execute(delete(Image).where(Image.owner_id == owner_id, Image.id.in_(ids))).rowcount
