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


@pytest.fixture
def make_client(engine):
    """Factory for API clients bound to the temp database; ``secure`` selects the cookie mode."""
    from fastapi.testclient import TestClient

    from app.core.settings import Settings, get_settings
    from app.db.engine import get_session
    from app.main import create_app

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
