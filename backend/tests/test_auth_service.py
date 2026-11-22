import pytest
from pwdlib import PasswordHash
from pwdlib.hashers.argon2 import Argon2Hasher
from sqlalchemy import func, select

from app.core import passwords
from app.db.models import User, Workspace
from app.repositories import workspaces as workspaces_repo
from app.services import auth
from app.services.auth import (
    EmailAlreadyRegistered,
    InvalidRegistration,
    authenticate,
    normalize_email,
    register_user,
)
from app.services.starter_templates import default_workspace_config
from app.services.workspace_config import normalize_config

PASSWORD = "correct horse battery"


def counts(session):
    return (
        session.scalar(select(func.count()).select_from(User)),
        session.scalar(select(func.count()).select_from(Workspace)),
    )


# ---- registration ---------------------------------------------------------------

def test_registration_creates_user_and_valid_default_workspace(session):
    user = register_user(session, "alice@example.com", PASSWORD)
    assert counts(session) == (1, 1)
    workspace = workspaces_repo.get_for_user(session, user.id)
    assert workspace.revision == 1
    assert workspace.config == default_workspace_config()
    assert normalize_config(workspace.config) == workspace.config


def test_each_user_gets_an_independent_workspace(session):
    a = register_user(session, "a@example.com", PASSWORD)
    b = register_user(session, "b@example.com", PASSWORD)
    wa, wb = (workspaces_repo.get_for_user(session, u.id) for u in (a, b))
    assert wa.id != wb.id and wa.config == wb.config and wa.config is not wb.config


def test_password_is_stored_as_argon2_hash_only(session):
    user = register_user(session, "alice@example.com", PASSWORD)
    assert user.password_hash.startswith("$argon2id$")
    assert PASSWORD not in user.password_hash
    assert user.password_hash != register_user(session, "b@example.com", PASSWORD).password_hash  # salted


def test_email_is_normalized(session):
    user = register_user(session, "  Alice@Example.COM ", PASSWORD)
    assert user.email == "alice@example.com"


def test_duplicate_normalized_email_is_rejected_without_side_effects(session):
    register_user(session, "alice@example.com", PASSWORD)
    with pytest.raises(EmailAlreadyRegistered):
        register_user(session, " ALICE@example.com", PASSWORD)
    assert counts(session) == (1, 1)


def test_concurrent_duplicate_is_reported_as_duplicate(session, monkeypatch):
    register_user(session, "alice@example.com", PASSWORD)
    monkeypatch.setattr(auth.users, "get_by_email", lambda *_: None)  # simulate losing the race
    with pytest.raises(EmailAlreadyRegistered):
        register_user(session, "alice@example.com", PASSWORD)
    assert counts(session) == (1, 1)


@pytest.mark.parametrize("email", [
    "", "plain", "@example.com", "a@", "a@b", "a b@example.com", "a@@example.com",
    "a@example..com", "a..b@example.com", ".a@example.com", "a.@example.com", "a@-example.com",
    "a\n@example.com","ä@example.com", "a@exämple.com", "a" * 65 + "@example.com",
    "a@" + "b" * 250 + ".com", None, 5,
])
def test_invalid_emails_are_rejected(session, email):
    with pytest.raises(InvalidRegistration) as info:
        register_user(session, email, PASSWORD)
    assert set(info.value.errors) == {"email"}
    assert counts(session) == (0, 0)


@pytest.mark.parametrize("email", ["a@example.com", "first.last+tag@sub.example.co.uk", "x_y-z@e-x.io"])
def test_valid_emails_are_accepted(email):
    assert normalize_email(email) == email


@pytest.mark.parametrize("password,ok", [
    ("a" * 11, False), ("a" * 12, True), ("\U0001F600" * 12, True), ("a" * 128, True),
    ("a" * 129, False), ("", False), (None, False), (123456789012, False),
])
def test_password_length_rules(session, password, ok):
    if ok:
        register_user(session, "alice@example.com", password)
        assert counts(session) == (1, 1)
    else:
        with pytest.raises(InvalidRegistration) as info:
            register_user(session, "alice@example.com", password)
        assert set(info.value.errors) == {"password"}
        assert counts(session) == (0, 0)


def test_both_fields_reported_together(session):
    with pytest.raises(InvalidRegistration) as info:
        register_user(session, "nope", "short")
    assert set(info.value.errors) == {"email", "password"}


def test_oversized_password_never_reaches_the_hasher(session, monkeypatch):
    monkeypatch.setattr(passwords, "hash_password", lambda *_: pytest.fail("hashed an oversized password"))
    with pytest.raises(InvalidRegistration):
        register_user(session, "alice@example.com", "a" * 10_000)


def test_failure_after_user_insert_rolls_back_everything(session, monkeypatch):
    def boom(*_args, **_kwargs):
        raise RuntimeError("workspace insert failed")

    monkeypatch.setattr(auth.workspaces, "add", boom)
    with pytest.raises(RuntimeError):
        register_user(session, "alice@example.com", PASSWORD)
    assert counts(session) == (0, 0)
    monkeypatch.undo()
    register_user(session, "alice@example.com", PASSWORD)  # session is still usable
    assert counts(session) == (1, 1)


# ---- verification ---------------------------------------------------------------

def test_correct_credentials_authenticate_case_insensitively(session):
    user = register_user(session, "alice@example.com", PASSWORD)
    assert authenticate(session, "ALICE@example.com ", PASSWORD).id == user.id


def test_wrong_password_unknown_user_and_bad_input_all_fail_the_same_way(session):
    register_user(session, "alice@example.com", PASSWORD)
    assert authenticate(session, "alice@example.com", "wrong password here") is None
    assert authenticate(session, "nobody@example.com", PASSWORD) is None
    assert authenticate(session, "not-an-email", PASSWORD) is None
    assert authenticate(session, "alice@example.com", None) is None


def test_unknown_user_still_costs_a_hash_verification(session, monkeypatch):
    calls = []
    monkeypatch.setattr(passwords, "verify_against_dummy", lambda pw: calls.append(pw))
    assert authenticate(session, "nobody@example.com", PASSWORD) is None
    assert calls == [PASSWORD]


def test_oversized_login_password_never_reaches_the_hasher(session, monkeypatch):
    register_user(session, "alice@example.com", PASSWORD)
    monkeypatch.setattr(passwords, "verify_password", lambda *_: pytest.fail("verified oversized"))
    monkeypatch.setattr(passwords, "verify_against_dummy", lambda *_: pytest.fail("verified oversized"))
    assert authenticate(session, "alice@example.com", "a" * 10_000) is None


def test_outdated_hash_is_upgraded_on_login(session):
    weak = PasswordHash((Argon2Hasher(time_cost=1, memory_cost=1024, parallelism=1),))
    user = register_user(session, "alice@example.com", PASSWORD)
    user.password_hash = weak.hash(PASSWORD)
    session.commit()
    old = user.password_hash
    assert authenticate(session, "alice@example.com", PASSWORD) is not None
    session.refresh(user)
    assert user.password_hash != old and "m=65536" in user.password_hash
    assert authenticate(session, "alice@example.com", PASSWORD) is not None  # still valid
