"""Request guards: current user, Origin check, JSON-only bodies, and synchronizer-token CSRF."""

from dataclasses import dataclass

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.core.security import tokens_match
from app.core.settings import Settings, get_settings
from app.db.engine import get_session
from app.db.models import User, UserSession
from app.repositories import users
from app.services import sessions as session_service

CSRF_HEADER = "X-CSRF-Token"


@dataclass
class AuthContext:
    user: User
    session: UserSession
    token: str  # raw cookie token (never logged or returned)


def get_current_auth(
    request: Request,
    db: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> AuthContext:
    """Authenticate from the session cookie only; anything else is a generic 401."""
    token = request.cookies.get(settings.session_cookie_name)
    row = session_service.resolve(db, token) if token else None
    user = users.get_by_id(db, row.user_id) if row else None
    if token is None or row is None or user is None:
        raise ApiError(401, "unauthenticated", "Authentication is required.")
    return AuthContext(user=user, session=row, token=token)


def check_origin(request: Request, settings: Settings) -> None:
    """Browser mutations must carry an allowed Origin; a missing Origin is rejected."""
    origin = request.headers.get("origin")
    if origin is None or origin not in settings.allowed_origins:
        raise ApiError(403, "origin_not_allowed", "Request origin is not allowed.")


def public_mutation_guard(request: Request, settings: Settings = Depends(get_settings)) -> None:
    """For login/register (no session yet): allowed Origin and a JSON body."""
    check_origin(request, settings)
    if request.headers.get("content-type", "").split(";")[0].strip().lower() != "application/json":
        raise ApiError(415, "unsupported_media_type", "Send the request body as application/json.")


def require_csrf(
    request: Request,
    auth: AuthContext = Depends(get_current_auth),
    settings: Settings = Depends(get_settings),
) -> AuthContext:
    """For authenticated POST/PUT/DELETE: session first (401), then Origin and CSRF token (403)."""
    check_origin(request, settings)
    supplied = request.headers.get(CSRF_HEADER)
    if not supplied or not tokens_match(supplied, auth.session.csrf_token):
        raise ApiError(403, "csrf_failed", "CSRF token is missing or invalid.")
    return auth
