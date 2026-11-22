import copy
import json

import pytest
from sqlalchemy import select

from app.db.models import User, Workspace
from app.services.starter_templates import default_workspace_config
from tests.helpers import ORIGIN, login, put, register

MINIMAL = {"schemaVersion": 1, "title": "Saved"}
JSON_HEADERS = {"Content-Type": "application/json"}


@pytest.fixture
def alice(client):
    """A logged-in client plus its csrf token."""
    return client, register(client).json()["csrfToken"]


def save(client_csrf, config, base_revision, **kwargs):
    client, csrf = client_csrf
    return put(client, "/api/workspace", {"baseRevision": base_revision, "config": config}, csrf=csrf, **kwargs)


def raw_put(client_csrf, content, content_type="application/json"):
    client, csrf = client_csrf
    headers = {"Origin": ORIGIN, "X-CSRF-Token": csrf, "Content-Type": content_type}
    return client.put("/api/workspace", content=content, headers=headers)


def stored(session, email="alice@example.com"):
    session.rollback()  # end any read transaction so a fresh snapshot (WAL) sees the app's commits
    user = session.scalar(select(User).where(User.email == email))
    return session.scalar(select(Workspace).where(Workspace.user_id == user.id))


# ---- read ---------------------------------------------------------------------------

def test_anonymous_access_is_401(client):
    assert client.get("/api/workspace").status_code == 401
    assert put(client, "/api/workspace", {"baseRevision": 1, "config": MINIMAL}, csrf="x").status_code == 401


def test_get_returns_the_default_workspace_envelope(alice, session):
    client, _ = alice
    response = client.get("/api/workspace")
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"id", "revision", "updatedAt", "config"}
    assert body["revision"] == 1 and body["config"] == default_workspace_config()
    assert body["id"] == stored(session).id
    assert response.headers["cache-control"] == "no-store"


def test_two_users_have_independent_workspaces(client, make_client):
    alice_csrf = register(client).json()["csrfToken"]
    bob = make_client()
    bob_csrf = register(bob, email="bob@example.com").json()["csrfToken"]
    assert save((client, alice_csrf), {**MINIMAL, "title": "Alice workspace"}, 1).status_code == 200
    assert save((bob, bob_csrf), {**MINIMAL, "title": "Bob workspace"}, 1).status_code == 200
    assert client.get("/api/workspace").json()["config"]["title"] == "Alice workspace"
    assert bob.get("/api/workspace").json()["config"]["title"] == "Bob workspace"
    assert client.get("/api/workspace").json()["id"] != bob.get("/api/workspace").json()["id"]


def test_get_normalizes_in_memory_without_rewriting_storage(alice, session):
    client, _ = alice
    row = stored(session)
    row.config = {"schemaVersion": 1, "title": "Sparse"}  # missing optional fields, as an old save might be
    session.commit()
    body = client.get("/api/workspace").json()
    assert body["config"]["theme"]["primary"] == "#6366f1" and body["config"]["sections"] == []
    assert stored(session).config == {"schemaVersion": 1, "title": "Sparse"} and stored(session).revision == 1


@pytest.mark.parametrize("stored_config,code", [
    ({"schemaVersion": 2, "title": "Future"}, "unsupported_schema_version"),
    ({"schemaVersion": 1}, "invalid_config"),
])
def test_get_of_unreadable_stored_data_is_422_and_never_resets_it(alice, session, stored_config, code):
    client, _ = alice
    row = stored(session)
    row.config = stored_config
    session.commit()
    response = client.get("/api/workspace")
    assert response.status_code == 422 and response.json()["error"]["code"] == code
    assert stored(session).config == stored_config


# ---- save ---------------------------------------------------------------------------

def test_save_round_trips_and_increments_revision(alice, session):
    config = copy.deepcopy(default_workspace_config())
    config["title"] = "Edited"
    config["sections"][0]["widgets"][2]["props"]["body"] = "Changed note"
    response = save(alice, config, 1)
    assert response.status_code == 200
    body = response.json()
    assert body["revision"] == 2 and body["config"] == config
    assert alice[0].get("/api/workspace").json()["config"] == config
    assert (stored(session).revision, stored(session).config) == (2, config)
    assert body["updatedAt"] > "2000"


def test_save_returns_the_canonical_document_with_defaults_filled(alice):
    body = save(alice, MINIMAL, 1).json()
    assert body["config"]["theme"]["fontSizePx"] == 16 and body["config"]["navigation"]["placement"] == "left"
    assert body["config"]["sections"] == []


def test_revision_conflict_for_a_stale_tab(client, make_client, session):
    csrf_a = register(client).json()["csrfToken"]
    second_tab = make_client()
    second = (second_tab, login(second_tab).json()["csrfToken"])
    first_save = save((client, csrf_a), {**MINIMAL, "title": "From tab 1"}, 1)
    stale = save(second, {**MINIMAL, "title": "From tab 2"}, 1)
    assert first_save.status_code == 200
    assert stale.status_code == 409
    error = stale.json()["error"]
    assert error["code"] == "revision_conflict" and error["details"] == {"currentRevision": 2}
    assert stored(session).config["title"] == "From tab 1" and stored(session).revision == 2
    assert save(second, {**MINIMAL, "title": "Retry"}, 2).status_code == 200
    assert stored(session).revision == 3


def test_future_base_revision_is_a_conflict_not_an_overwrite(alice, session):
    response = save(alice, MINIMAL, 99)
    assert response.status_code == 409 and response.json()["error"]["details"]["currentRevision"] == 1
    assert stored(session).config == default_workspace_config()


def test_conditional_update_only_matches_the_callers_workspace(client, make_client, session):
    """Bob saving with a matching revision number cannot touch Alice's row."""
    register(client)
    bob = make_client()
    bob_csrf = register(bob, email="bob@example.com").json()["csrfToken"]
    assert save((bob, bob_csrf), {**MINIMAL, "title": "Bob"}, 1).status_code == 200
    assert stored(session, "alice@example.com").config == default_workspace_config()
    assert stored(session, "alice@example.com").revision == 1


@pytest.mark.parametrize("base", [0, -1, 1.5, "1", True, None])
def test_invalid_base_revision_is_422(alice, session, base):
    response = save(alice, MINIMAL, base)
    assert response.status_code == 422 and response.json()["error"]["code"] == "validation_error"
    assert stored(session).revision == 1


@pytest.mark.parametrize("extra", [{"userId": "someone-else"}, {"ownerId": "x"}, {"workspaceId": "x"}])
def test_ownership_fields_in_the_body_are_rejected(alice, session, extra):
    client, csrf = alice
    response = put(client, "/api/workspace", {"baseRevision": 1, "config": MINIMAL, **extra}, csrf=csrf)
    assert response.status_code == 422
    assert stored(session).config == default_workspace_config()


def test_ownership_fields_inside_config_are_rejected(alice, session):
    for key in ("userId", "ownerId", "id", "revision"):
        response = save(alice, {**MINIMAL, key: "x"}, 1)
        assert response.status_code == 422 and response.json()["error"]["code"] == "invalid_config"
    assert stored(session).config == default_workspace_config()


@pytest.mark.parametrize("config,code", [
    ({"schemaVersion": 1}, "invalid_config"),
    ({"schemaVersion": 2, "title": "x"}, "unsupported_schema_version"),
    ({"title": "no version"}, "invalid_config"),
    ([], "invalid_config"),
    ("text", "invalid_config"),
    (None, "invalid_config"),
])
def test_invalid_or_future_configs_leave_storage_intact(alice, session, config, code):
    response = save(alice, config, 1)
    assert response.status_code == 422 and response.json()["error"]["code"] == code
    row = stored(session)
    assert (row.revision, row.config) == (1, default_workspace_config())


def test_validation_errors_do_not_echo_private_content(alice):
    secret = "TOP-SECRET-NOTE"
    config = {**MINIMAL, "sections": [{"id": "s", "kind": "stack", "widgets": [
        {"id": "w", "type": "notes", "props": {"body": secret, "bogus": 1}}]}]}
    response = save(alice, config, 1)
    assert response.status_code == 422 and secret not in response.text
    assert response.json()["error"]["details"]["errors"]


# ---- size limits ----------------------------------------------------------------------

def blob_config(size: int) -> dict:
    return {**MINIMAL, "sections": [{"id": "s", "kind": "stack", "widgets": [
        {"id": "w", "type": "mystery", "props": {"blob": "x" * size}}]}]}


def test_config_just_under_one_mebibyte_is_accepted(alice, session):
    config = blob_config(1024 * 1024 - 300)
    assert len(json.dumps(config, separators=(",", ":"))) <= 1024 * 1024
    assert save(alice, config, 1).status_code == 200
    assert stored(session).revision == 2


@pytest.mark.parametrize("size", [1024 * 1024 + 100, 3 * 1024 * 1024])
def test_oversized_config_is_413_and_storage_is_intact(alice, session, size):
    response = save(alice, blob_config(size), 1)
    assert response.status_code == 413 and response.json()["error"]["code"] == "payload_too_large"
    assert stored(session).config == default_workspace_config() and stored(session).revision == 1


def test_oversized_body_without_valid_json_is_413_before_parsing(alice):
    assert raw_put(alice, b"{" + b" " * (2 * 1024 * 1024)).status_code == 413


# ---- guards ---------------------------------------------------------------------------

def test_put_requires_csrf_origin_and_json(alice, session):
    client, csrf = alice
    body = {"baseRevision": 1, "config": MINIMAL}
    assert put(client, "/api/workspace", body).status_code == 403
    assert put(client, "/api/workspace", body, csrf="wrong").status_code == 403
    assert put(client, "/api/workspace", body, csrf=csrf, origin=None).status_code == 403
    assert put(client, "/api/workspace", body, csrf=csrf, origin="https://evil.example").status_code == 403
    assert raw_put(alice, json.dumps(body), content_type="text/plain").status_code == 415
    assert stored(session).config == default_workspace_config()


@pytest.mark.parametrize("content", [b"{not json", b"", b'{"baseRevision": 1, "config": NaN}', b"[1,2]"])
def test_malformed_bodies_are_422(alice, content):
    assert raw_put(alice, content).status_code == 422


def test_unauthenticated_requests_are_rejected_before_the_body_is_read(client):
    response = client.put("/api/workspace", content=b"x" * (2 * 1024 * 1024),
                          headers={"Origin": ORIGIN, "Content-Type": "text/plain"})
    assert response.status_code == 401


def test_nan_in_an_opaque_widget_cannot_be_stored(alice):
    raw = ('{"baseRevision":1,"config":{"schemaVersion":1,"title":"t","sections":[{"id":"s","kind":"stack",'
           '"widgets":[{"id":"w","type":"mystery","props":{"n":NaN}}]}]}}')
    response = raw_put(alice, raw)
    assert response.status_code == 422 and response.json()["error"]["code"] == "invalid_json"


def test_unknown_widgets_survive_an_unrelated_save(alice):
    config = {**MINIMAL, "sections": [{"id": "s", "kind": "stack", "widgets": [
        {"id": "u", "type": "kanban", "title": "Board", "hidden": False,
         "appearance": {"anything": 1}, "props": {"columns": [1, {"a": None}]}}]}]}
    assert save(alice, config, 1).status_code == 200
    edited = alice[0].get("/api/workspace").json()["config"]
    edited["title"] = "Renamed"
    body = save(alice, edited, 2).json()
    assert body["config"]["sections"] == edited["sections"] and body["revision"] == 3


def test_truly_concurrent_saves_with_the_same_base_yield_one_success_and_one_conflict(client, make_client, session):
    import threading

    csrf_a = register(client).json()["csrfToken"]
    other = make_client()
    second = (other, login(other).json()["csrfToken"])
    first = (client, csrf_a)
    barrier = threading.Barrier(2)
    results = {}

    def worker(name, who):
        barrier.wait()
        results[name] = save(who, {**MINIMAL, "title": name}, 1).status_code

    threads = [threading.Thread(target=worker, args=(n, w)) for n, w in (("tab-1", first), ("tab-2", second))]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert sorted(results.values()) == [200, 409]
    winner = next(name for name, status in results.items() if status == 200)
    assert stored(session).config["title"] == winner and stored(session).revision == 2
