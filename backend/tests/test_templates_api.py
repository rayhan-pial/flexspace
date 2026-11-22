import copy
import json

import pytest
from sqlalchemy import select

from app.db.models import Template, User, Workspace
from app.services.seed import seed_system_templates
from app.services.starter_templates import SYSTEM_TEMPLATE_NAMES, default_workspace_config, starter_config
from tests.helpers import ORIGIN, post, put, register, request

MINIMAL = {"schemaVersion": 1, "title": "Snapshot"}


@pytest.fixture(autouse=True)
def seeded(session):
    seed_system_templates(session)
    session.commit()


@pytest.fixture
def alice(client):
    return client, register(client).json()["csrfToken"]


@pytest.fixture
def bob(make_client):
    c = make_client()
    return c, register(c, email="bob@example.com").json()["csrfToken"]


def create(who, name="My template", config=MINIMAL, **kwargs):
    client, csrf = who
    return post(client, "/api/templates", {"name": name, "config": config}, csrf=csrf, **kwargs)


def remove(who, template_id, **kwargs):
    client, csrf = who
    return request(client, "DELETE", f"/api/templates/{template_id}", csrf=csrf, **kwargs)


def raw_post(who, content, content_type="application/json"):
    client, csrf = who
    return client.post("/api/templates", content=content,
                       headers={"Origin": ORIGIN, "X-CSRF-Token": csrf, "Content-Type": content_type})


def system_id(client, key="productivity"):
    return next(i["id"] for i in client.get("/api/templates").json()["items"] if i["name"] == SYSTEM_TEMPLATE_NAMES[key])


def workspace_row(session, email="alice@example.com"):
    session.rollback()
    user = session.scalar(select(User).where(User.email == email))
    return session.scalar(select(Workspace).where(Workspace.user_id == user.id))


# ---- listing ---------------------------------------------------------------------------

def test_anonymous_access_is_401_everywhere(client):
    assert client.get("/api/templates").status_code == 401
    assert client.get("/api/templates/anything").status_code == 401
    assert post(client, "/api/templates", {"name": "x", "config": MINIMAL}, csrf="x").status_code == 401
    assert request(client, "DELETE", "/api/templates/anything", csrf="x").status_code == 401


def test_list_shows_system_templates_in_order_then_own_newest_first(alice):
    client, _ = alice
    first = create(alice, "First").json()["id"]
    second = create(alice, "Second").json()["id"]
    response = client.get("/api/templates")
    assert response.status_code == 200 and response.headers["cache-control"] == "no-store"
    items = response.json()["items"]
    assert [i["kind"] for i in items] == ["system"] * 3 + ["custom"] * 2
    assert [i["name"] for i in items[:3]] == list(SYSTEM_TEMPLATE_NAMES.values())
    assert [i["id"] for i in items[3:]] == [second, first]
    assert all(set(i) == {"id", "name", "kind", "updatedAt"} for i in items)  # metadata only


def test_list_never_includes_another_users_templates(alice, bob):
    create(alice, "Alice private")
    create(bob, "Bob private")
    assert [i["name"] for i in alice[0].get("/api/templates").json()["items"] if i["kind"] == "custom"] == ["Alice private"]
    assert [i["name"] for i in bob[0].get("/api/templates").json()["items"] if i["kind"] == "custom"] == ["Bob private"]


# ---- detail ---------------------------------------------------------------------------

def test_system_template_detail_returns_a_valid_config(alice):
    client, _ = alice
    body = client.get(f"/api/templates/{system_id(client)}").json()
    assert body["kind"] == "system" and body["config"] == starter_config("productivity")


def test_own_template_detail_round_trips(alice):
    client, _ = alice
    created = create(alice, "Mine").json()
    assert client.get(f"/api/templates/{created['id']}").json() == created


def test_other_users_template_is_404_not_403(alice, bob):
    secret = create(alice, "Alice private").json()["id"]
    for response in (bob[0].get(f"/api/templates/{secret}"), remove(bob, secret)):
        assert response.status_code == 404 and response.json()["error"]["code"] == "not_found"
    assert alice[0].get(f"/api/templates/{secret}").status_code == 200  # still there


def test_unknown_template_is_404(alice):
    assert alice[0].get("/api/templates/does-not-exist").status_code == 404
    assert remove(alice, "does-not-exist").status_code == 404


def test_detail_normalizes_in_memory_without_rewriting_storage(alice, session):
    created = create(alice, "Sparse").json()
    row = session.get(Template, created["id"])
    row.config = {"schemaVersion": 1, "title": "Sparse"}
    session.commit()
    body = alice[0].get(f"/api/templates/{created['id']}").json()
    assert body["config"]["theme"]["primary"] == "#6366f1"
    session.rollback()
    assert session.get(Template, created["id"]).config == {"schemaVersion": 1, "title": "Sparse"}


# ---- create ---------------------------------------------------------------------------

def test_create_returns_full_envelope_and_assigns_the_session_owner(alice, session):
    response = create(alice, "  Design A  ", default_workspace_config())
    assert response.status_code == 201
    body = response.json()
    assert set(body) == {"id", "name", "kind", "updatedAt", "config"}
    assert body["name"] == "Design A" and body["kind"] == "custom" and body["config"] == default_workspace_config()
    session.rollback()
    row = session.get(Template, body["id"])
    alice_id = session.scalar(select(User.id).where(User.email == "alice@example.com"))
    assert row.owner_id == alice_id and row.system_key is None


def test_create_stores_the_canonical_config_with_defaults(alice):
    assert create(alice, "Sparse").json()["config"]["theme"]["fontSizePx"] == 16


@pytest.mark.parametrize("extra", [{"ownerId": "x"}, {"userId": "x"}, {"systemKey": "productivity"}, {"kind": "system"}])
def test_ownership_and_kind_fields_in_the_body_are_rejected(alice, session, extra):
    client, csrf = alice
    response = post(client, "/api/templates", {"name": "n", "config": MINIMAL, **extra}, csrf=csrf)
    assert response.status_code == 422
    assert len(client.get("/api/templates").json()["items"]) == 3


@pytest.mark.parametrize("name,ok", [("a", True), ("x" * 80, True), ("\U0001F600" * 80, True), ("  padded  ", True),
                                     ("", False), ("   ", False), ("x" * 81, False), (None, False), (5, False)])
def test_template_name_rules(alice, name, ok):
    assert (create(alice, name).status_code == 201) is ok


def test_duplicate_names_are_allowed(alice):
    assert create(alice, "Same").status_code == 201 and create(alice, "Same").status_code == 201


@pytest.mark.parametrize("config,code", [
    ({"schemaVersion": 1}, "invalid_config"),
    ({"schemaVersion": 2, "title": "x"}, "unsupported_schema_version"),
    ([], "invalid_config"),
    (None, "invalid_config"),
    ({**MINIMAL, "ownerId": "x"}, "invalid_config"),
])
def test_invalid_configs_are_rejected_without_creating_anything(alice, config, code):
    response = create(alice, "Bad", config)
    assert response.status_code == 422 and response.json()["error"]["code"] == code
    assert len(alice[0].get("/api/templates").json()["items"]) == 3


def test_oversized_config_is_413(alice):
    huge = {**MINIMAL, "sections": [{"id": "s", "kind": "stack", "widgets": [
        {"id": "w", "type": "mystery", "props": {"blob": "x" * (1024 * 1024 + 100)}}]}]}
    assert create(alice, "Huge", huge).status_code == 413
    assert raw_post(alice, b"{" + b" " * (2 * 1024 * 1024)).status_code == 413
    assert len(alice[0].get("/api/templates").json()["items"]) == 3


def test_validation_errors_do_not_echo_private_content(alice):
    secret = "TOP-SECRET-NOTE"
    config = {**MINIMAL, "sections": [{"id": "s", "kind": "stack", "widgets": [
        {"id": "w", "type": "notes", "props": {"body": secret, "bogus": 1}}]}]}
    response = create(alice, "Leaky", config)
    assert response.status_code == 422 and secret not in response.text


def test_create_and_delete_require_csrf_origin_and_json(alice):
    client, csrf = alice
    body = {"name": "n", "config": MINIMAL}
    assert post(client, "/api/templates", body).status_code == 403
    assert post(client, "/api/templates", body, csrf="wrong").status_code == 403
    assert post(client, "/api/templates", body, csrf=csrf, origin=None).status_code == 403
    assert post(client, "/api/templates", body, csrf=csrf, origin="https://evil.example").status_code == 403
    assert raw_post(alice, json.dumps(body), content_type="text/plain").status_code == 415
    mine = create(alice).json()["id"]
    assert request(client, "DELETE", f"/api/templates/{mine}").status_code == 403
    assert request(client, "DELETE", f"/api/templates/{mine}", csrf=csrf, origin="https://evil.example").status_code == 403
    assert client.get(f"/api/templates/{mine}").status_code == 200


@pytest.mark.parametrize("content", [b"{bad", b"", b"[1]", b'{"name":"n","config":NaN}'])
def test_malformed_bodies_are_422(alice, content):
    assert raw_post(alice, content).status_code == 422


# ---- the workspace is independent -----------------------------------------------------

def test_creating_a_template_never_changes_the_workspace_or_its_revision(alice, session):
    client, csrf = alice
    edited = copy.deepcopy(default_workspace_config())
    edited["title"] = "Saved workspace"
    assert put(client, "/api/workspace", {"baseRevision": 1, "config": edited}, csrf=csrf).status_code == 200
    before = workspace_row(session)
    snapshot = (before.revision, before.config, before.updated_at)
    create(alice, "Other design", {**MINIMAL, "title": "Template only"})
    after = workspace_row(session)
    assert (after.revision, after.config, after.updated_at) == snapshot
    assert client.get("/api/workspace").json()["config"]["title"] == "Saved workspace"


def test_templates_are_snapshots_independent_of_later_workspace_saves(alice):
    client, csrf = alice
    tid = create(alice, "Snap", default_workspace_config()).json()["id"]
    changed = copy.deepcopy(default_workspace_config())
    changed["title"] = "Changed later"
    put(client, "/api/workspace", {"baseRevision": 1, "config": changed}, csrf=csrf)
    assert client.get(f"/api/templates/{tid}").json()["config"]["title"] == default_workspace_config()["title"]


# ---- delete ---------------------------------------------------------------------------

def test_delete_own_custom_template(alice, session):
    client, _ = alice
    keep = create(alice, "Keep").json()["id"]
    drop = create(alice, "Drop").json()["id"]
    before = workspace_row(session)
    response = remove(alice, drop)
    assert response.status_code == 204 and response.content == b""
    assert client.get(f"/api/templates/{drop}").status_code == 404
    assert client.get(f"/api/templates/{keep}").status_code == 200
    assert remove(alice, drop).status_code == 404  # already gone
    after = workspace_row(session)
    assert (after.revision, after.config) == (before.revision, before.config)


def test_system_templates_cannot_be_deleted(alice):
    client, _ = alice
    response = remove(alice, system_id(client))
    assert response.status_code == 403 and response.json()["error"]["code"] == "system_template_read_only"
    assert len(client.get("/api/templates").json()["items"]) == 3


def test_deleting_a_users_template_does_not_affect_another_users_copy_of_the_same_design(alice, bob):
    a = create(alice, "Shared design").json()["id"]
    b = create(bob, "Shared design").json()["id"]
    assert remove(alice, a).status_code == 204
    assert bob[0].get(f"/api/templates/{b}").status_code == 200
