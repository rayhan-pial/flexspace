from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, get_current_auth, require_csrf
from app.core.errors import ApiError
from app.db.engine import get_session
from app.services import images_service as service

router = APIRouter(prefix="/api/images", tags=["images"])


async def _read_image_body(request: Request) -> bytes:
    """Read the raw image bytes, stopping as soon as the limit is passed (a false Content-Length cannot bypass it)."""
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > service.MAX_IMAGE_BYTES:
        raise ApiError(413, "image_too_large", "That image is larger than 5 MB.")
    received = bytearray()
    async for chunk in request.stream():
        received.extend(chunk)
        if len(received) > service.MAX_IMAGE_BYTES:
            raise ApiError(413, "image_too_large", "That image is larger than 5 MB.")
    return bytes(received)


@router.post("", status_code=201)
async def upload_image(
    request: Request,
    auth: AuthContext = Depends(require_csrf),  # session, Origin and CSRF before the body is read
    db: Session = Depends(get_session),
):
    data = await _read_image_body(request)
    try:
        image = service.store_image(db, auth.user.id, data)
    except service.UnsupportedImage as exc:
        raise ApiError(415, "unsupported_image", "Use a PNG, JPEG, GIF or WebP image.") from exc
    except service.ImageTooLarge as exc:
        raise ApiError(413, "image_too_large", "That image is larger than 5 MB.") from exc
    except service.ImageQuotaExceeded as exc:
        raise ApiError(409, "image_quota_exceeded", "You have reached your image storage limit.") from exc
    return {"id": image.id, "contentType": image.content_type, "size": image.size}


@router.get("/{image_id}")
def read_image(image_id: str, auth: AuthContext = Depends(get_current_auth), db: Session = Depends(get_session)):
    try:
        image = service.get_image(db, auth.user.id, image_id)
    except service.ImageNotFound as exc:
        raise ApiError(404, "not_found", "Image not found.") from exc
    return Response(
        content=image.data,
        media_type=image.content_type,
        headers={"X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox"},
    )
