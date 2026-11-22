import json

from scripts.export_schema import TARGET, build_schema


def test_exported_json_schema_matches_models():
    """Drift check: regenerate with `python scripts/export_schema.py` after changing models."""
    committed = json.loads(TARGET.read_text("utf-8"))
    assert committed == json.loads(json.dumps(build_schema()))
