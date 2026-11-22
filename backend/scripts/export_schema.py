"""Write contracts/workspace-config.schema.json from the Pydantic models.

Run from backend/:  .venv/Scripts/python scripts/export_schema.py
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.schemas.config import KNOWN_PROPS, WorkspaceConfig  # noqa: E402

TARGET = Path(__file__).resolve().parents[2] / "contracts" / "workspace-config.schema.json"


def build_schema() -> dict:
    return {
        "workspace": WorkspaceConfig.model_json_schema(by_alias=True),
        "widgetProps": {k: m.model_json_schema(by_alias=True) for k, m in KNOWN_PROPS.items()},
    }


if __name__ == "__main__":
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    TARGET.write_text(
        json.dumps(build_schema(), indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n"
    )
    print(f"wrote {TARGET}")
