import logging
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select, update

from app.core.security import hash_token
from app.core.settings import Settings, get_settings
from app.db.engine import get_session, make_session_factory
from app.db.models import User, UserSession, Workspace
from app.main import create_app

ORIGIN = "http://localhost:5173"
PASSWORD = "correct horse battery"
COOKIE = "flexspace_session"


@pytest.fixture
def make_client(engine):
    """Factory for clients bound to the temp database; ``secure`` selects the cookie mode."""
    factory = make_session_factory(engine)
    clients = []

    def build(secure: bool = True) -> TestClient:
        app = create_app()

        def override_session():
            with factory() as s:
                yield s

        app.dependency_overrides[get_session] = override_session
        app.dependency_overrides[get_settings] = lambda: Settings(cookie_secure=secure)
        client = TestClient(app, base_url="https://testserver" if secure else "http://testserver")
        clients.append(client)
        return client

    yield build
    for c in clients:
        c.close()


@pytest.fixture
def client(make_client):
    return make_client(secure=True)


def post(client, path, body=None, *, origin=ORIGIN, csrf=None, **kwargs):
    headers = {}
    if origin is not None:
        headers["Origin"] = origin
    if csrf is not None:
        headers["X-CSRF-Token"] = csrf
    return client.post(path, json=body, headers=headers, **kwargs)


def register(client, email="alice@example.com", password=PASSWORD):
    return post(client, "/api/auth/register", {"email": email, "password": password})


def login(client, email="alice@example.com", password=PASSWORD):
    return post(client, "/api/auth/login", {"email": email, "password": password})


def count(session, model):
    return session.scalar(select(func.count()).select_from(model))


def set_cookie(response) -> str:
    return response.headers.get_list("set-cookie")[0].lower()


# ---- register / me ---------------------------------------------------------------

def test_register_creates_account_workspace_and_session(client, session):
    response = register(client)
    assert response.status_code == 201
    body = response.json()
    assert set(body) == {"user", "csrfToken"} and set(body["user"]) == {"id", "email"}
    assert body["user"]["email"] == "alice@example.com"
    assert (count(session, User), count(session, Workspace), count(session, UserSession)) == (1, 1, 1)
    me = client.get("/api/auth/me")
    assert me.status_code == 200 and me.json() == body


def test_session_token_is_stored_only_as_a_hash(client, session):
    register(client)
    raw = client.cookies.get(COOKIE)
    assert len(raw) >= 43  # 32 random bytes, URL-safe
    row = session.scalars(select(UserSession)).one()
    assert row.token_hash == hash_token(raw) and raw not in (row.token_hash, row.csrf_token)
    assert abs((row.expires_at - row.created_at) - timedelta(hours=8)) < timedelta(seconds=5)  # fixed, not sliding


def test_cookie_flags_in_https_mode(client):
    cookie = set_cookie(register(client))
    for flag in ("httponly", "secure", "samesite=lax", "path=/", "max-age=28800"):
        assert flag in cookie
    assert "domain" not in cookie


def test_cookie_flags_in_localhost_mode(make_client):
    cookie = set_cookie(register(make_client(secure=False)))
    assert "secure" not in cookie
    for flag in ("httponly", "samesite=lax", "path=/", "max-age=28800"):
        assert flag in cookie
    assert "domain" not in cookie


def test_duplicate_email_conflicts(client):
    register(client)
    other = register(client, email=" ALICE@example.com")
    assert other.status_code == 409 and other.json()["error"]["code"] == "email_taken"


def test_register_validation_uses_envelope_and_never_echoes_the_password(client):
    secret = "short"
    response = register(client, email="nope", password=secret)
    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "validation_error" and set(error["details"]["fields"]) == {"email", "password"}
    assert secret not in response.text


def test_oversized_and_malformed_bodies_use_the_envelope_without_echo(client):
    secret = "x" * 2000
    response = register(client, password=secret)
    assert response.status_code == 422 and secret not in response.text
    assert response.json()["error"]["code"] == "validation_error"
    missing = post(client, "/api/auth/login", {"email": "a@example.com"})
    assert missing.status_code == 422 and "errors" in missing.json()["error"]["details"]
    extra = post(client, "/api/auth/login", {"email": "a@example.com", "password": PASSWORD, "userId": "1"})
    assert extra.status_code == 422


# ---- login ---------------------------------------------------------------------

def test_login_issues_a_fresh_session_and_revokes_the_old_one(client, session):
    register(client)
    first = client.cookies.get(COOKIE)
    response = login(client)
    assert response.status_code == 200
    second = client.cookies.get(COOKIE)
    assert second != first
    assert [r.token_hash for r in session.scalars(select(UserSession))] == [hash_token(second)]


def test_separate_browsers_hold_independent_sessions(client, make_client):
    register(client)
    other = make_client()
    assert login(other).status_code == 200
    assert client.get("/api/auth/me").status_code == 200 and other.get("/api/auth/me").status_code == 200


def test_login_failures_are_indistinguishable(client):
    register(client)
    cases = [
        login(client, password="wrong password here"),
        login(client, email="nobody@example.com"),
        login(client, email="not-an-email"),
        login(client, password="tiny"),
    ]
    assert {c.status_code for c in cases} == {401}
    assert len({c.text for c in cases}) == 1
    assert cases[0].json()["error"]["code"] == "invalid_credentials"
    assert all("set-cookie" not in c.headers for c in cases)


def test_login_is_case_insensitive_on_email(client):
    register(client)
    assert login(client, email="ALICE@Example.com").status_code == 200


# ---- anonymous / invalid / expired / logout ------------------------------------------

def test_anonymous_and_garbage_cookies_get_401(client):
    for headers in ({}, {"Cookie": f"{COOKIE}=not-a-real-token"}):
        response = client.get("/api/auth/me", headers=headers)
        assert response.status_code == 401 and response.json()["error"]["code"] == "unauthenticated"


def test_expired_session_is_rejected_and_removed(client, session):
    register(client)
    session.execute(update(UserSession).values(expires_at=datetime.now(UTC) - timedelta(seconds=1)))
    session.commit()
    assert client.get("/api/auth/me").status_code == 401
    assert count(session, UserSession) == 0


def test_logout_revokes_server_side_and_clears_cookie(client, make_client, session):
    csrf = register(client).json()["csrfToken"]
    stolen = client.cookies.get(COOKIE)
    response = post(client, "/api/auth/logout", csrf=csrf)
    assert response.status_code == 204 and response.content == b""
    cleared = set_cookie(response)
    assert f"{COOKIE}=" in cleared and ("max-age=0" in cleared or "1970" in cleared)
    assert client.get("/api/auth/me").status_code == 401
    assert count(session, UserSession) == 0
    replay = make_client()
    assert replay.get("/api/auth/me", headers={"Cookie": f"{COOKIE}={stolen}"}).status_code == 401


def test_logout_anonymous_is_401_not_403(client):
    assert post(client, "/api/auth/logout", csrf="anything").status_code == 401


# ---- CSRF / Origin ---------------------------------------------------------------

def test_logout_requires_matching_csrf_token(client):
    csrf = register(client).json()["csrfToken"]
    assert post(client, "/api/auth/logout").status_code == 403
    assert post(client, "/api/auth/logout", csrf="wrong").status_code == 403
    assert post(client, "/api/auth/logout", csrf=csrf[:-1]).status_code == 403
    assert client.get("/api/auth/me").status_code == 200  # nothing was revoked
    assert post(client, "/api/auth/logout", csrf=csrf).status_code == 204


def test_csrf_token_from_another_session_is_rejected(client, make_client):
    register(client)
    bob = make_client()
    bob_csrf = register(bob, email="bob@example.com").json()["csrfToken"]
    response = post(client, "/api/auth/logout", csrf=bob_csrf)
    assert response.status_code == 403 and response.json()["error"]["code"] == "csrf_failed"


@pytest.mark.parametrize("origin", [None, "https://evil.example", "http://localhost:5173.evil.example", "null"])
def test_authenticated_mutation_needs_allowed_origin(client, origin):
    csrf = register(client).json()["csrfToken"]
    response = post(client, "/api/auth/logout", csrf=csrf, origin=origin)
    assert response.status_code == 403 and response.json()["error"]["code"] == "origin_not_allowed"
    assert client.get("/api/auth/me").status_code == 200


@pytest.mark.parametrize("path", ["/api/auth/register", "/api/auth/login"])
@pytest.mark.parametrize("origin", [None, "https://evil.example"])
def test_public_mutations_need_allowed_origin(client, path, origin):
    response = post(client, path, {"email": "a@example.com", "password": PASSWORD}, origin=origin)
    assert response.status_code == 403 and "set-cookie" not in response.headers


@pytest.mark.parametrize("path", ["/api/auth/register", "/api/auth/login"])
def test_public_mutations_require_json(client, path):
    form = client.post(path, data={"email": "a@example.com", "password": PASSWORD}, headers={"Origin": ORIGIN})
    assert form.status_code == 415 and form.json()["error"]["code"] == "unsupported_media_type"
    text = client.post(path, content='{"email":"a@example.com"}', headers={"Origin": ORIGIN, "Content-Type": "text/plain"})
    assert text.status_code == 415


# ---- responses, errors, logging --------------------------------------------------------

def test_private_responses_are_not_cacheable(client):
    for response in (register(client), client.get("/api/auth/me"), login(client, password="bad bad bad bad"),
                     client.get("/api/auth/unknown")):
        assert response.headers["cache-control"] == "no-store"
    assert "cache-control" not in client.get("/api/health").headers


def test_framework_errors_use_the_envelope(client):
    missing = client.get("/api/nope")
    assert missing.status_code == 404 and missing.json()["error"]["code"] == "not_found"
    wrong_method = client.get("/api/auth/login")
    assert wrong_method.status_code == 405 and wrong_method.json()["error"]["code"] == "method_not_allowed"


def test_credentials_and_tokens_never_appear_in_responses_or_logs(client, caplog):
    caplog.set_level(logging.DEBUG)
    responses = [register(client), login(client), login(client, password="not the password"), client.get("/api/auth/me")]
    token = client.cookies.get(COOKIE)
    for response in responses:
        assert PASSWORD not in response.text and "password_hash" not in response.text and "argon2" not in response.text
        assert token not in response.text
    assert PASSWORD not in caplog.text and "not the password" not in caplog.text and token not in caplog.text
