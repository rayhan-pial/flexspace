from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from app.db.models import Image
from app.services import images_service
from tests.helpers import ORIGIN, post, put, register, request

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64
GIF = b"GIF89a" + b"\x00" * 64
WEBP = b"RIFF\x24\x00\x00\x00WEBPVP8 " + b"\x00" * 32


@pytest.fixture
def alice(client):
    return client, register(client).json()["csrfToken"]


@pytest.fixture
def bob(make_client):
    c = make_client()
    return c, register(c, email="bob@example.com").json()["csrfToken"]


def upload(who, data, content_type="image/png", **kwargs):
    client, csrf = who
    headers = {"Origin": ORIGIN, "X-CSRF-Token": csrf, "Content-Type": content_type}
    return client.post("/api/images", content=data, headers=headers, **kwargs)


def workspace_with(who, keys):
    client, csrf = who
    current = client.get("/api/workspace").json()
    config = current["config"]
    items = [{"id": f"img-{n}", "assetKey": key, "alt": "", "caption": ""} for n, key in enumerate(keys)]
    config["sections"] = [{"id": "s1", "kind": "stack", "title": "Pics", "widgets": [
        {"id": "w1", "type": "gallery", "title": "Photos", "props": {"items": items}}]}]
    config["navigation"]["primaryItems"] = []
    config["navigation"]["secondaryItems"] = []
    return put(client, "/api/workspace", {"baseRevision": current["revision"], "config": config}, csrf=csrf)


@pytest.mark.parametrize("data,kind", [(PNG, "image/png"), (JPEG, "image/jpeg"), (GIF, "image/gif"), (WEBP, "image/webp")])
def test_upload_and_read_back_each_supported_type(alice, data, kind):
    response = upload(alice, data, content_type="application/octet-stream")  # the declared type is not trusted
    assert response.status_code == 201
    body = response.json()
    assert body["contentType"] == kind and body["size"] == len(data)
    client, _ = alice
    got = client.get(f"/api/images/{body['id']}")
    assert got.status_code == 200 and got.content == data
    assert got.headers["content-type"] == kind
    assert got.headers["x-content-type-options"] == "nosniff"
    assert "sandbox" in got.headers["content-security-policy"]


@pytest.mark.parametrize("data", [
    b"",
    b"<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>",
    b"<html></html>",
    b"MZ\x90\x00",
    b"not an image",
])
def test_only_real_raster_images_are_accepted_whatever_they_claim(alice, data):
    assert upload(alice, data, content_type="image/png").status_code == 415
    assert upload(alice, data, content_type="image/svg+xml").status_code == 415


def test_oversized_images_are_413(alice):
    big = PNG + b"\x00" * images_service.MAX_IMAGE_BYTES
    assert upload(alice, big).status_code == 413


def test_upload_requires_login_csrf_and_a_trusted_origin(client, make_client):
    anonymous = make_client()
    assert anonymous.post("/api/images", content=PNG, headers={"Origin": ORIGIN, "Content-Type": "image/png"}).status_code == 401
    assert anonymous.get("/api/images/anything").status_code == 401
    who = (client, register(client).json()["csrfToken"])
    headers = {"Origin": ORIGIN, "Content-Type": "image/png"}
    assert client.post("/api/images", content=PNG, headers=headers).status_code == 403  # no CSRF token
    bad = {"Origin": "https://evil.example", "X-CSRF-Token": who[1], "Content-Type": "image/png"}
    assert client.post("/api/images", content=PNG, headers=bad).status_code == 403


def test_an_image_is_private_to_its_owner(alice, bob):
    image_id = upload(alice, PNG).json()["id"]
    assert alice[0].get(f"/api/images/{image_id}").status_code == 200
    assert bob[0].get(f"/api/images/{image_id}").status_code == 404  # not 403: existence is not revealed
    assert bob[0].get("/api/images/00000000-0000-0000-0000-000000000000").status_code == 404


def test_the_per_user_count_and_size_limits(alice, monkeypatch):
    monkeypatch.setattr(images_service, "MAX_IMAGES_PER_USER", 2)
    assert upload(alice, PNG).status_code == 201
    assert upload(alice, PNG).status_code == 201
    third = upload(alice, PNG)
    assert third.status_code == 409 and third.json()["error"]["code"] == "image_quota_exceeded"
    monkeypatch.setattr(images_service, "MAX_IMAGES_PER_USER", 200)
    monkeypatch.setattr(images_service, "MAX_TOTAL_BYTES_PER_USER", len(PNG) * 2 + 5)
    assert upload(alice, PNG).status_code == 409


def test_a_gallery_can_reference_an_upload_and_the_key_is_stored_verbatim(alice):
    image_id = upload(alice, PNG).json()["id"]
    saved = workspace_with(alice, [f"upload:{image_id}", "aurora"])
    assert saved.status_code == 200
    items = saved.json()["config"]["sections"][0]["widgets"][0]["props"]["items"]
    assert [i["assetKey"] for i in items] == [f"upload:{image_id}", "aurora"]


@pytest.mark.parametrize("key", [
    "upload:",
    "upload:../../etc/passwd",
    "upload:123E4567-E89B-42D3-A456-426614174000",
    "https://x.test/a.png",
    "UPLOAD:123e4567-e89b-42d3-a456-426614174000",
])
def test_malformed_upload_keys_are_rejected(alice, key):
    assert workspace_with(alice, [key]).status_code == 422


def test_unreferenced_old_uploads_are_pruned_on_save_but_fresh_and_used_ones_survive(alice, session):
    used = upload(alice, PNG).json()["id"]
    stale = upload(alice, PNG).json()["id"]
    fresh = upload(alice, PNG).json()["id"]
    session.rollback()
    old = datetime.now(UTC) - timedelta(hours=3)
    for image_id in (used, stale):
        session.get(Image, image_id).created_at = old
    session.commit()
    assert workspace_with(alice, [f"upload:{used}"]).status_code == 200
    session.rollback()
    remaining = set(session.scalars(select(Image.id)))
    assert remaining == {used, fresh}  # the stale one is gone; the used and the just-uploaded stay


def test_images_used_only_by_a_template_are_kept_until_it_is_deleted(alice, session):
    client, csrf = alice
    image_id = upload(alice, PNG).json()["id"]
    config = {"schemaVersion": 1, "title": "T", "sections": [{"id": "s1", "kind": "stack", "title": "P", "widgets": [
        {"id": "w1", "type": "gallery", "props": {"items": [{"id": "i1", "assetKey": f"upload:{image_id}"}]}}]}]}
    template_id = post(client, "/api/templates", {"name": "With image", "config": config}, csrf=csrf).json()["id"]
    session.rollback()
    session.get(Image, image_id).created_at = datetime.now(UTC) - timedelta(hours=3)
    session.commit()
    assert workspace_with(alice, ["aurora"]).status_code == 200  # a save prunes, but the template still uses it
    session.rollback()
    assert session.get(Image, image_id) is not None
    assert request(client, "DELETE", f"/api/templates/{template_id}", csrf=csrf).status_code == 204
    session.rollback()
    assert session.get(Image, image_id) is None


def test_pruning_never_touches_another_users_images(alice, bob, session):
    theirs = upload(bob, PNG).json()["id"]
    session.rollback()
    session.get(Image, theirs).created_at = datetime.now(UTC) - timedelta(hours=5)
    session.commit()
    assert workspace_with(alice, ["aurora"]).status_code == 200
    session.rollback()
    assert session.get(Image, theirs) is not None
