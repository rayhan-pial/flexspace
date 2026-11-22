import pytest
from alembic import command
from sqlalchemy.orm import Session

from app.db.engine import make_engine, make_session_factory
from tests.alembic_helpers import alembic_config


@pytest.fixture
def db_url(tmp_path):
    return f"sqlite:///{(tmp_path / 'test.db').as_posix()}"


@pytest.fixture
def engine(db_url):
    """A fresh temporary SQLite database migrated to head (not seeded)."""
    command.upgrade(alembic_config(db_url), "head")
    engine = make_engine(db_url)
    yield engine
    engine.dispose()


@pytest.fixture
def session(engine) -> Session:
    with make_session_factory(engine)() as s:
        yield s
