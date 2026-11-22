from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, get_current_auth, public_mutation_guard, require_csrf
from app.core.errors import ApiError
from app.core.settings import Settings, get_settings
from app.db.engine import get_session
from app.db.models import User
from app.schemas.auth import AuthResponse, Credentials, UserOut
from app.services import auth as auth_service
from app.services import sessions as session_service

router = APIRouter(prefix="/api/auth", tags=["auth"])

_COOKIE_ATTRS = {"httponly": True, "samesite": "lax", "path": "/"}  # no Domain: host-only cookie


def _start(request: Request, response: Response, db: Session, settings: Settings, user: User) -> AuthResponse:
    """Revoke any session this browser already holds, then issue a brand-new one."""
    previous = request.cookies.get(settings.session_cookie_name)
    if previous:
        session_service.revoke(db, previous)
    token, row = session_service.start_session(db, user.id, settings.session_ttl_hours)
    response.set_cookie(
        settings.session_cookie_name, token, max_age=settings.session_ttl_hours * 3600,
        secure=settings.cookie_secure, **_COOKIE_ATTRS,
    )
    return AuthResponse(user=UserOut(id=user.id, email=user.email), csrfToken=row.csrf_token)


@router.post("/register", status_code=201, response_model=AuthResponse, dependencies=[Depends(public_mutation_guard)])
def register(
    body: Credentials, request: Request, response: Response,
    db: Session = Depends(get_session), settings: Settings = Depends(get_settings),
):
    try:
        user = auth_service.register_user(db, body.email, body.password)
    except auth_service.InvalidRegistration as exc:
        raise ApiError(422, "validation_error", "The request is not valid.", {"fields": exc.errors}) from exc
    except auth_service.EmailAlreadyRegistered as exc:
        raise ApiError(409, "email_taken", "An account with this email already exists.") from exc
    return _start(request, response, db, settings, user)


@router.post("/login", response_model=AuthResponse, dependencies=[Depends(public_mutation_guard)])
def login(
    body: Credentials, request: Request, response: Response,
    db: Session = Depends(get_session), settings: Settings = Depends(get_settings),
):
    user = auth_service.authenticate(db, body.email, body.password)
    if user is None:  # one generic message for unknown email, wrong password and malformed input
        raise ApiError(401, "invalid_credentials", "Invalid email or password.")
    return _start(request, response, db, settings, user)


@router.get("/me", response_model=AuthResponse)
def me(auth: AuthContext = Depends(get_current_auth)):
    return AuthResponse(user=UserOut(id=auth.user.id, email=auth.user.email), csrfToken=auth.session.csrf_token)


@router.post("/logout", status_code=204)
def logout(
    auth: AuthContext = Depends(require_csrf),
    db: Session = Depends(get_session), settings: Settings = Depends(get_settings),
):
    session_service.revoke(db, auth.token)
    response = Response(status_code=204)
    response.delete_cookie(settings.session_cookie_name, secure=settings.cookie_secure, **_COOKIE_ATTRS)
    return response
