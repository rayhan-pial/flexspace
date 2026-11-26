"""Uploaded gallery images, stored in the database and private to their owner."""

import re
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Image, Template, Workspace
from app.repositories import images

MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_IMAGES_PER_USER = 200
MAX_TOTAL_BYTES_PER_USER = 100 * 1024 * 1024
# An image uploaded but not yet saved into the workspace must survive; only older unreferenced ones are pruned.
PRUNE_GRACE = timedelta(hours=1)
UPLOAD_KEY = re.compile(r"^upload:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$")


class UnsupportedImage(Exception):
    pass


class ImageTooLarge(Exception):
    pass


class ImageQuotaExceeded(Exception):
    pass


class ImageNotFound(Exception):
    """Missing, or owned by someone else (deliberately indistinguishable)."""


def sniff_type(data: bytes) -> str | None:
    """The real type from the file's own header bytes; the client's declared type is never trusted."""
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def store_image(db: Session, owner_id: str, data: bytes) -> Image:
    """Validate and save; commits. Raises UnsupportedImage, ImageTooLarge or ImageQuotaExceeded."""
    if not data:
        raise UnsupportedImage()
    if len(data) > MAX_IMAGE_BYTES:
        raise ImageTooLarge()
    content_type = sniff_type(data)
    if content_type is None:
        raise UnsupportedImage()
    count, total = images.usage(db, owner_id)
    if count >= MAX_IMAGES_PER_USER or total + len(data) > MAX_TOTAL_BYTES_PER_USER:
        raise ImageQuotaExceeded()
    try:
        image = images.add(db, owner_id, content_type, data)
        db.commit()
    except BaseException:
        db.rollback()
        raise
    return image


def get_image(db: Session, owner_id: str, image_id: str) -> Image:
    image = images.get_owned(db, image_id, owner_id)
    if image is None:
        raise ImageNotFound()
    return image


def referenced_ids(config: Any) -> set[str]:
    """Image ids named by gallery items anywhere in a workspace or template config."""
    found: set[str] = set()
    for section in (config or {}).get("sections", []) if isinstance(config, dict) else []:
        for widget in section.get("widgets", []):
            if widget.get("type") != "gallery":
                continue
            for item in (widget.get("props") or {}).get("items", []):
                match = UPLOAD_KEY.match(str(item.get("assetKey", "")))
                if match:
                    found.add(match.group(1))
    return found


def prune_unreferenced(db: Session, owner_id: str, now: datetime | None = None) -> int:
    """Delete the owner's images that neither their saved workspace nor any of their templates uses,
    once they are older than the grace period. Commits only when something was removed."""
    cutoff = (now or datetime.now(UTC)) - PRUNE_GRACE
    candidates = images.ids_older_than(db, owner_id, cutoff)
    if not candidates:
        return 0
    keep: set[str] = set()
    for config in db.scalars(select(Workspace.config).where(Workspace.user_id == owner_id)):
        keep |= referenced_ids(config)
    for config in db.scalars(select(Template.config).where(Template.owner_id == owner_id)):
        keep |= referenced_ids(config)
    doomed = [i for i in candidates if i not in keep]
    removed = images.delete_ids(db, owner_id, doomed)
    if removed:
        db.commit()
    return removed
