from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import func, inspect, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.settings import Settings
from app.db.engine import make_engine
from app.db.models import Base, Template, User, UserSession, Workspace
from app.repositories import sessions as sessions_repo
from app.repositories import templates as templates_repo
from app.repositories import users as users_repo
from app.repositories import workspaces as workspaces_repo
from app.services.seed import seed_system_templates
from app.services.starter_templates import (
    SYSTEM_TEMPLATE_NAMES,
    default_workspace_config,
    starter_config,
)
from app.services.workspace_config import normalize_config
from scripts.init_db import migrate_and_seed
from tests.alembic_helpers import alembic_config


def count(session, model) -> int:
    return session.scalar(select(func.count()).select_from(model))


def make_user(session, email="a@example.com"):
    return users_repo.add(session, email, "hash")


# ---- migrations ---------------------------------------------------------------

def test_migration_creates_expected_tables(engine):
    assert set(inspect(engine).get_table_names()) == {
        "users", "workspaces", "templates", "sessions", "alembic_version"}


def test_migration_matches_models(engine):
    with engine.connect() as conn:
        diff = compare_metadata(MigrationContext.configure(conn), Base.metadata)
    assert diff == []


def test_downgrade_removes_everything(engine, db_url):
    command.downgrade(alembic_config(db_url), "base")
    assert set(inspect(engine).get_table_names()) <= {"alembic_version"}


def test_database_url_is_the_connection_boundary(tmp_path):
    url = f"sqlite:///{(tmp_path / 'custom.db').as_posix()}"
    assert Settings(database_url=url).database_url == url
    assert str(make_engine(url).url).endswith("custom.db")


# ---- constraints ---------------------------------------------------------------

def test_foreign_keys_are_enforced(session):
    session.add(Workspace(user_id="missing", config={}))
    with pytest.raises(IntegrityError):
        session.flush()


def test_email_is_unique(session):
    make_user(session)
    with pytest.raises(IntegrityError):
        make_user(session)


def test_one_workspace_per_user(session):
    user = make_user(session)
    workspaces_repo.add(session, user.id, {"a": 1})
    with pytest.raises(IntegrityError):
        workspaces_repo.add(session, user.id, {"a": 2})


def test_workspace_revision_must_be_positive(session):
    user = make_user(session)
    session.add(Workspace(user_id=user.id, config={}, revision=0))
    with pytest.raises(IntegrityError):
        session.flush()


@pytest.mark.parametrize("with_owner,with_key", [(True, True), (False, False)])
def test_template_is_either_system_or_custom(session, with_owner, with_key):
    owner_id = make_user(session).id if with_owner else None
    session.add(Template(name="bad", owner_id=owner_id, system_key="k" if with_key else None, config={}))
    with pytest.raises(IntegrityError):
        session.flush()


def test_system_key_is_unique_but_custom_templates_may_repeat_names(session):
    templates_repo.add_system(session, "k", "K", {})
    with pytest.raises(IntegrityError):
        templates_repo.add_system(session, "k", "K2", {})
    session.rollback()
    user = make_user(session)
    session.add_all([Template(name="same", owner_id=user.id, config={}) for _ in range(2)])
    session.flush()


def test_deleting_a_user_cascades(session):
    user = make_user(session)
    workspaces_repo.add(session, user.id, {})
    session.add(Template(name="mine", owner_id=user.id, config={}))
    sessions_repo.add(session, "h" * 64, user.id, "csrf", datetime.now(UTC) + timedelta(hours=8))
    templates_repo.add_system(session, "sys", "Sys", {})
    session.flush()
    session.delete(user)
    session.flush()
    assert (count(session, Workspace), count(session, UserSession)) == (0, 0)
    assert [t.system_key for t in session.scalars(select(Template))] == ["sys"]


# ---- transactions ---------------------------------------------------------------

def test_rollback_leaves_no_partial_registration(session):
    with pytest.raises(RuntimeError):
        with session.begin():
            user = make_user(session)
            workspaces_repo.add(session, user.id, default_workspace_config())
            raise RuntimeError("fail after both inserts")
    assert (count(session, User), count(session, Workspace)) == (0, 0)


def test_failed_second_insert_rolls_back_the_first(session):
    make_user(session, "taken@example.com")
    session.commit()
    with pytest.raises(IntegrityError):
        with session.begin():
            make_user(session, "new@example.com")
            make_user(session, "taken@example.com")
    assert [u.email for u in session.scalars(select(User))] == ["taken@example.com"]


def test_committed_data_survives_a_new_session(engine):
    with Session(engine) as s, s.begin():
        user = make_user(s)
        workspaces_repo.add(s, user.id, {"hello": "world"})
    with Session(engine) as s:
        found = users_repo.get_by_email(s, "a@example.com")
        workspace = workspaces_repo.get_for_user(s, found.id)
        assert workspace.config == {"hello": "world"} and workspace.revision == 1
        assert workspace.created_at.tzinfo is UTC


def test_naive_datetimes_are_rejected(session):
    user = make_user(session)
    with pytest.raises(Exception, match="naive"):
        sessions_repo.add(session, "x" * 64, user.id, "c", datetime(2030, 1, 1))


def test_expired_sessions_can_be_purged(session):
    user = make_user(session)
    now = datetime.now(UTC)
    sessions_repo.add(session, "a" * 64, user.id, "c", now - timedelta(minutes=1))
    sessions_repo.add(session, "b" * 64, user.id, "c", now + timedelta(hours=1))
    assert sessions_repo.delete_expired(session, now) == 1
    assert sessions_repo.get_by_hash(session, "a" * 64) is None
    sessions_repo.delete_by_hash(session, "b" * 64)
    assert count(session, UserSession) == 0


# ---- seeding ---------------------------------------------------------------

def test_seeding_twice_duplicates_nothing(session):
    assert seed_system_templates(session) == 3
    session.commit()
    assert seed_system_templates(session) == 0
    session.commit()
    keys = sorted(t.system_key for t in session.scalars(select(Template)))
    assert keys == sorted(SYSTEM_TEMPLATE_NAMES)


def test_seeding_does_not_overwrite_existing_rows(session):
    templates_repo.add_system(session, "productivity", "Renamed", {"custom": True})
    assert seed_system_templates(session) == 2
    assert templates_repo.get_by_system_key(session, "productivity").name == "Renamed"


def test_init_script_migrates_and_seeds_idempotently(db_url):
    assert migrate_and_seed(db_url) == 3
    assert migrate_and_seed(db_url) == 0


def test_starter_configs_are_valid_distinct_and_fresh():
    configs = {key: starter_config(key) for key in SYSTEM_TEMPLATE_NAMES}
    for config in configs.values():
        assert normalize_config(config) == config  # already normalized and valid
    assert len({c["title"] for c in configs.values()}) == 3
    assert len({c["navigation"]["placement"] for c in configs.values()}) == 3
    first, second = starter_config("productivity"), starter_config("productivity")
    assert first == second and first is not second
    assert default_workspace_config() == configs["productivity"]


def test_route_modules_contain_no_sql():
    for path in (Path(__file__).resolve().parents[1] / "app" / "api").glob("*.py"):
        text = path.read_text("utf-8")
        assert "sqlalchemy" not in text and "select(" not in text, path.name
