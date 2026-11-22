"""Engine and session factory. ``DATABASE_URL`` (FLEXSPACE_DATABASE_URL) is the only connection boundary."""

from collections.abc import Iterator
from functools import lru_cache

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from app.core.settings import get_settings


def make_engine(url: str) -> Engine:
    """Create an engine. SQLite specifics (foreign keys, transaction mode) stay in this function."""
    connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
    engine = create_engine(url, connect_args=connect_args)
    if engine.dialect.name == "sqlite":

        @event.listens_for(engine, "connect")
        def _sqlite_connect(dbapi_connection, _record):
            # Take transaction control away from pysqlite so BEGIN/COMMIT/ROLLBACK are
            # exactly what SQLAlchemy emits (see the SQLAlchemy SQLite dialect docs).
            dbapi_connection.isolation_level = None
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")  # off by default in SQLite
            # WAL lets readers and the single writer proceed concurrently (two tabs, overlapping
            # requests); busy_timeout makes a brief writer-vs-writer clash wait instead of failing.
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA busy_timeout=5000")
            cursor.close()

        @event.listens_for(engine, "begin")
        def _sqlite_begin(connection):
            connection.exec_driver_sql("BEGIN")

    return engine


def make_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, expire_on_commit=False)


@lru_cache
def get_session_factory() -> sessionmaker[Session]:
    return make_session_factory(make_engine(get_settings().database_url))


def get_session() -> Iterator[Session]:
    """FastAPI dependency: one request-scoped session. Services decide when to commit."""
    session = get_session_factory()()
    try:
        yield session
    finally:
        session.close()
