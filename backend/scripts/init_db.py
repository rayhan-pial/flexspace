"""Apply migrations and seed the system templates (idempotent).

Run from backend/:  .venv/Scripts/python scripts/init_db.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402

from app.core.settings import get_settings  # noqa: E402
from app.db.engine import make_engine, make_session_factory  # noqa: E402
from app.services.seed import seed_system_templates  # noqa: E402

BACKEND_DIR = Path(__file__).resolve().parents[1]


def migrate_and_seed(url: str) -> int:
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "migrations"))
    cfg.set_main_option("sqlalchemy.url", url)
    command.upgrade(cfg, "head")
    engine = make_engine(url)
    try:
        with make_session_factory(engine)() as session, session.begin():
            return seed_system_templates(session)
    finally:
        engine.dispose()


if __name__ == "__main__":
    url = get_settings().database_url
    inserted = migrate_and_seed(url)
    print(f"database ready ({url}); seeded {inserted} new system template(s)")
