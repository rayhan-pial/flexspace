import copy
import json
from datetime import UTC, datetime

import pytest
from sqlalchemy import select

from app.db.models import Template, User, Workspace
from app.services.seed import seed_system_templates, sync_system_templates
from app.services.starter_templates import SYSTEM_TEMPLATE_NAMES, default_workspace_config, starter_config
from app.services.workspace_config import normalize_config
from scripts.export_template_fixtures import build_fixture, fixture_path
from tests.helpers import post, register

KEYS = list(SYSTEM_TEMPLATE_NAMES)
KNOWN = {"welcome", "tasks", "notes", "gallery", "analytics", "calendar"}


def widgets(config):
    return [w for s in config["sections"] for w in s["widgets"]]


def count_of(config, wtype):
    return sum(1 for w in widgets(config) if w["type"] == wtype)


# ---- the designs -----------------------------------------------------------------------

@pytest.mark.parametrize("key", KEYS)
def test_each_design_validates_and_is_already_canonical(key):
    config = starter_config(key)
    assert normalize_config(copy.deepcopy(config)) == config  # valid, and normalizing again changes nothing
    assert config["schemaVersion"] == 1 and config["title"]


@pytest.mark.parametrize("key", KEYS)
def test_the_shared_fixture_matches_the_design_in_code(key):
    """Drift check: regenerate with `python scripts/export_template_fixtures.py` after changing a design."""
    committed = json.loads(fixture_path(key).read_text("utf-8"))
    assert committed == json.loads(json.dumps(build_fixture(key)))


def test_the_designs_are_distinct():
    configs = {key: starter_config(key) for key in KEYS}
    assert len({c["title"] for c in configs.values()}) == 3
    assert len({c["navigation"]["placement"] for c in configs.values()}) == 3  # top, left and right
    assert len({c["theme"]["primary"] for c in configs.values()}) == 3
    assert len({json.dumps(c["theme"], sort_keys=True) for c in configs.values()}) == 3
    section_titles = [tuple(s["title"] for s in c["sections"]) for c in configs.values()]
    assert len(set(section_titles)) == 3
    # Each leans on a different widget: KPIs only in Analytics, galleries only in Creative.
    assert count_of(configs["analytics"], "analytics") >= 2 and count_of(configs["creative"], "analytics") == 0
    assert count_of(configs["creative"], "gallery") >= 2 and count_of(configs["analytics"], "gallery") == 0


def test_together_they_cover_the_schema():
    configs = [starter_config(key) for key in KEYS]
    kinds = {s["kind"] for c in configs for s in c["sections"]}
    assert kinds == {"grid", "stack"}
    assert {w["type"] for c in configs for w in widgets(c)} == KNOWN  # all six widget types
    assert {c["navigation"]["placement"] for c in configs} == {"top", "left", "right"}
    for config in configs:
        assert any(s["kind"] == "grid" for s in config["sections"])
        assert any(s["kind"] == "stack" for s in config["sections"])


def test_there_are_enough_compatible_containers_for_every_cross_container_move():
    analytics, creative, productivity = (starter_config(k) for k in ("analytics", "creative", "productivity"))
    for config in (analytics, creative, productivity):
        stacks = [s for s in config["sections"] if s["kind"] == "stack"]
        assert len(stacks) >= 1
    # cards between stack sections, and sections reordered at the root
    for config in (analytics, creative):
        assert len([s for s in config["sections"] if s["kind"] == "stack"]) >= 2
        assert len(config["sections"]) >= 3
        assert config["navigation"]["primaryItems"] and config["navigation"]["secondaryItems"]  # nav moves between groups
    # tasks between Tasks widgets, tiles between Galleries
    assert count_of(analytics, "tasks") >= 2 and count_of(creative, "tasks") >= 2
    assert count_of(creative, "gallery") >= 3
    # a task list, a gallery and an agenda that each hold entries to reorder
    for config, wtype, key in ((analytics, "tasks", "items"), (creative, "gallery", "items"), (analytics, "analytics", "metrics"), (creative, "calendar", "events")):
        assert any(len(w["props"][key]) >= 3 for w in widgets(config) if w["type"] == wtype)


@pytest.mark.parametrize("key", KEYS)
def test_every_design_is_visually_complete(key):
    """No empty widgets or sections, and grid layouts that leave no widget without a rectangle."""
    config = starter_config(key)
    assert all(s["widgets"] for s in config["sections"])
    for widget in widgets(config):
        assert widget["title"], f"{widget['id']} has a title"
        props = widget["props"]
        if widget["type"] == "welcome":
            assert props["greeting"]
        elif widget["type"] == "notes":
            assert props["body"].strip()
        elif widget["type"] in ("tasks", "gallery"):
            assert props["items"]
        elif widget["type"] == "analytics":
            assert props["metrics"]
        elif widget["type"] == "calendar":
            assert props["events"]
    for section in config["sections"]:
        if section["kind"] == "grid":
            assert {r["i"] for r in section["layout"]} == {w["id"] for w in section["widgets"]}


def test_every_nav_item_points_at_a_real_section():
    for key in KEYS:
        config = starter_config(key)
        ids = {s["id"] for s in config["sections"]}
        nav = config["navigation"]["primaryItems"] + config["navigation"]["secondaryItems"]
        assert nav and all(item["targetSectionId"] in ids for item in nav)


def test_new_users_still_start_from_the_productivity_design():
    assert default_workspace_config() == starter_config("productivity")
    config = starter_config("productivity")
    assert [s["title"] for s in config["sections"]] == ["Today", "Reference"]  # structure other tests and demos rely on


# ---- deliberate by-key sync ------------------------------------------------------------

def rows(session):
    session.rollback()
    return {t.system_key: t for t in session.scalars(select(Template).where(Template.system_key.is_not(None)))}


def test_sync_inserts_missing_templates_and_then_changes_nothing(session):
    first = sync_system_templates(session)
    session.commit()
    assert (first.inserted, first.updated, first.written) == (3, 0, 3)
    second = sync_system_templates(session)
    assert (second.inserted, second.updated, second.written) == (0, 0, 0)
    assert {k: t.name for k, t in rows(session).items()} == SYSTEM_TEMPLATE_NAMES


def test_sync_updates_outdated_system_rows_in_place_keeping_their_ids(session):
    seed_system_templates(session)
    session.commit()
    ids_before = {k: t.id for k, t in rows(session).items()}
    old = rows(session)["analytics"]
    old.name = "Old name"
    old.config = {"schemaVersion": 1, "title": "Old design"}
    session.commit()

    result = sync_system_templates(session)
    session.commit()
    assert (result.inserted, result.updated) == (0, 1)
    after = rows(session)
    assert {k: t.id for k, t in after.items()} == ids_before  # same rows, so listed ids stay valid
    assert after["analytics"].name == SYSTEM_TEMPLATE_NAMES["analytics"]
    assert after["analytics"].config == starter_config("analytics")
    assert after["productivity"].config == starter_config("productivity")


def test_sync_never_touches_user_workspaces_or_custom_templates(client, session):
    csrf = register(client).json()["csrfToken"]
    custom = post(client, "/api/templates", {"name": "Mine", "config": {"schemaVersion": 1, "title": "Private"}}, csrf=csrf)
    assert custom.status_code == 201
    seed_system_templates(session)
    session.commit()

    session.rollback()
    user = session.scalar(select(User).where(User.email == "alice@example.com"))
    workspace = session.scalar(select(Workspace).where(Workspace.user_id == user.id))
    workspace_before = (workspace.config, workspace.revision, workspace.updated_at)
    custom_row = session.get(Template, custom.json()["id"])
    custom_before = (custom_row.name, custom_row.config, custom_row.updated_at, custom_row.owner_id)

    for system in rows(session).values():  # make every system row stale so the sync really writes
        system.config = {"schemaVersion": 1, "title": "stale"}
    session.commit()
    assert sync_system_templates(session).updated == 3
    session.commit()

    session.rollback()
    workspace = session.scalar(select(Workspace).where(Workspace.user_id == user.id))
    assert (workspace.config, workspace.revision, workspace.updated_at) == workspace_before
    custom_row = session.get(Template, custom.json()["id"])
    assert (custom_row.name, custom_row.config, custom_row.updated_at, custom_row.owner_id) == custom_before
    assert custom_row.system_key is None


def test_sync_bumps_the_updated_time_only_for_rows_it_changes(session):
    seed_system_templates(session)
    session.commit()
    # Pin every row to a time safely in the past, so the assertion below cannot depend on the clock's
    # resolution (a sync landing in the same tick as the seed used to make this test flaky).
    pinned = datetime(2026, 1, 1, 12, 0, 0, tzinfo=UTC)
    for template in rows(session).values():
        template.updated_at = pinned
    session.commit()
    before = {k: t.updated_at for k, t in rows(session).items()}
    assert set(before.values()) == {pinned}
    stale = rows(session)["creative"]
    stale.config = {"schemaVersion": 1, "title": "stale"}
    session.commit()
    sync_system_templates(session)
    session.commit()
    after = {k: t.updated_at for k, t in rows(session).items()}
    assert after["creative"] > pinned
    assert after["productivity"] == before["productivity"] and after["analytics"] == before["analytics"]


def test_listing_order_keeps_productivity_first_for_restore_default(client, session):
    sync_system_templates(session)
    session.commit()
    register(client)
    items = client.get("/api/templates").json()["items"]
    assert [i["name"] for i in items if i["kind"] == "system"] == list(SYSTEM_TEMPLATE_NAMES.values())
    assert items[0]["name"] == "Productivity"  # the web client restores the default from the first system template


def test_sync_also_repairs_a_renamed_system_row_whose_content_is_unchanged(session):
    seed_system_templates(session)
    session.commit()
    row = rows(session)["creative"]
    row.name = "Renamed by hand"  # the content still matches the design
    session.commit()
    result = sync_system_templates(session)
    session.commit()
    assert (result.inserted, result.updated) == (0, 1)
    assert rows(session)["creative"].name == SYSTEM_TEMPLATE_NAMES["creative"]


def test_only_system_templates_can_be_rewritten_by_the_repository(client, session):
    from app.repositories import templates as templates_repo

    csrf = register(client).json()["csrfToken"]
    created = post(client, "/api/templates", {"name": "Mine", "config": {"schemaVersion": 1, "title": "Private"}}, csrf=csrf)
    session.rollback()
    custom = session.get(Template, created.json()["id"])
    with pytest.raises(ValueError):
        templates_repo.update_system(session, custom, "Hijacked", {"schemaVersion": 1, "title": "x"})
    assert custom.name == "Mine"
