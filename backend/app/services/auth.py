"""Credential validation, registration and verification (HTTP routes arrive in FS-005)."""

import re

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core import passwords
from app.db.models import User
from app.repositories import users, workspaces
from app.services.starter_templates import default_workspace_config

EMAIL_MAX = 254
PASSWORD_MIN = 12
PASSWORD_MAX = 128

_LABEL = r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?"
# Deliberately simple and ASCII-only: one @, dotted domain, no quoting or comments.
_EMAIL_RE = re.compile(rf"^[a-z0-9.!#$%&'*+/=?^_`{{|}}~-]{{1,64}}@{_LABEL}(?:\.{_LABEL})+$")


class InvalidRegistration(Exception):
    """Input failed validation; ``errors`` maps field name to a message."""

    def __init__(self, errors: dict[str, str]):
        super().__init__(str(errors))
        self.errors = errors


class EmailAlreadyRegistered(Exception):
    pass


def normalize_email(email: object) -> str:
    """Trim and lowercase; raises ``ValueError`` if the result is not a plausible address."""
    if not isinstance(email, str):
        raise ValueError("Email must be text.")
    value = email.strip().lower()
    local = value.split("@")[0]
    if (len(value) > EMAIL_MAX or not _EMAIL_RE.match(value) or ".." in value
            or local.startswith(".") or local.endswith(".")):
        raise ValueError("Enter a valid email address.")
    return value


def check_password(password: object) -> str:
    """Length-only policy (no composition rules); counts Unicode code points."""
    if not isinstance(password, str):
        raise ValueError("Password must be text.")
    if not PASSWORD_MIN <= len(password) <= PASSWORD_MAX:
        raise ValueError(f"Password must be {PASSWORD_MIN}-{PASSWORD_MAX} characters.")
    return password


def register_user(session: Session, email: object, password: object) -> User:
    """Create a user and their Productivity workspace in one transaction, then commit.

    On any failure nothing is persisted. Raises InvalidRegistration or EmailAlreadyRegistered.
    """
    errors: dict[str, str] = {}
    normalized = pw = None
    try:
        normalized = normalize_email(email)
    except ValueError as exc:
        errors["email"] = str(exc)
    try:
        pw = check_password(password)
    except ValueError as exc:
        errors["password"] = str(exc)
    if errors:
        raise InvalidRegistration(errors)

    password_hash = passwords.hash_password(pw)  # slow; done before touching the database
    try:
        if users.get_by_email(session, normalized) is not None:
            raise EmailAlreadyRegistered(normalized)
        user = users.add(session, normalized, password_hash)
        workspaces.add(session, user.id, default_workspace_config())
        session.commit()
    except IntegrityError as exc:  # lost a race with a concurrent registration
        session.rollback()
        raise EmailAlreadyRegistered(normalized) from exc
    except BaseException:
        session.rollback()
        raise
    return user


def authenticate(session: Session, email: object, password: object) -> User | None:
    """Return the user for valid credentials, otherwise ``None`` (callers show one generic error)."""
    try:
        normalized = normalize_email(email)
        pw = check_password(password)
    except ValueError:
        return None  # malformed or oversized input never reaches the hasher

    user = users.get_by_email(session, normalized)
    if user is None:
        passwords.verify_against_dummy(pw)
        return None
    valid, upgraded = passwords.verify_password(pw, user.password_hash)
    if not valid:
        return None
    if upgraded is not None:  # transparently move to current Argon2 parameters
        user.password_hash = upgraded
        session.commit()
    return user
