"""Argon2id password hashing (pwdlib). Callers must bound password length before hashing."""

from pwdlib import PasswordHash

_hasher = PasswordHash.recommended()

# Verified against when the account does not exist, so unknown and known emails cost the same.
_DUMMY_HASH = _hasher.hash("flexspace-dummy-password")


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> tuple[bool, str | None]:
    """Return ``(valid, upgraded_hash)``; ``upgraded_hash`` is set when parameters are outdated."""
    return _hasher.verify_and_update(password, password_hash)


def verify_against_dummy(password: str) -> None:
    _hasher.verify(password, _DUMMY_HASH)
