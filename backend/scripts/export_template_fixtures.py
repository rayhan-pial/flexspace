"""Write one shared valid fixture per system template into contracts/fixtures/valid/.

The fixtures hold each curated design exactly as the API serves it, so the frontend parser and the
backend normalizer are both held to the real template content (see contracts/README.md). A drift
test fails when the designs in code and these files disagree; regenerate them here.

Run from backend/:  .venv/Scripts/python scripts/export_template_fixtures.py
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.starter_templates import SYSTEM_TEMPLATE_NAMES, starter_config  # noqa: E402

TARGET_DIR = Path(__file__).resolve().parents[2] / "contracts" / "fixtures" / "valid"


def fixture_path(system_key: str) -> Path:
    return TARGET_DIR / f"system-template-{system_key}.json"


def build_fixture(system_key: str) -> dict:
    return {
        "description": f"The curated {SYSTEM_TEMPLATE_NAMES[system_key]} system template, as served by the API.",
        "input": starter_config(system_key),
    }


if __name__ == "__main__":
    TARGET_DIR.mkdir(parents=True, exist_ok=True)
    for key in SYSTEM_TEMPLATE_NAMES:
        path = fixture_path(key)
        path.write_text(json.dumps(build_fixture(key), indent=2) + "\n", encoding="utf-8", newline="\n")
        print(f"wrote {path}")
