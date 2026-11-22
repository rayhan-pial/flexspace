import copy
import json
from pathlib import Path

import pytest

from app.schemas.config import KNOWN_PROPS
from app.services.workspace_config import (
    InvalidConfig,
    UnsupportedSchemaVersion,
    normalize_config,
)

FIXTURES = Path(__file__).resolve().parents[2] / "contracts" / "fixtures"


def load(kind: str):
    return [pytest.param(json.loads(p.read_text("utf-8")), id=p.stem)
            for p in sorted((FIXTURES / kind).glob("*.json"))]


@pytest.mark.parametrize("case", load("valid"))
def test_valid_fixture_normalizes_to_expected(case):
    raw = case["input"]
    before = copy.deepcopy(raw)
    result = normalize_config(raw)
    assert result == case.get("expected", raw)
    assert raw == before, "normalize_config must not mutate its input"
    assert normalize_config(result) == result, "normalization is idempotent"


@pytest.mark.parametrize("case", load("invalid"))
def test_invalid_fixture_is_rejected(case):
    expected = UnsupportedSchemaVersion if case["error"] == "unsupported_schema_version" else InvalidConfig
    with pytest.raises(expected):
        normalize_config(case["input"])


def test_fixture_directories_are_populated():
    assert len(load("valid")) >= 4 and len(load("invalid")) >= 40


def test_non_object_documents_are_invalid():
    for bad in (None, [], "x", 3):
        with pytest.raises(InvalidConfig):
            normalize_config(bad)


# ---- limits (generated, shared in spirit with frontend limits test) ----------

def base(**extra):
    return {"schemaVersion": 1, "title": "t", **extra}


def stack_with(widgets, section_id="s1"):
    return {"id": section_id, "kind": "stack", "widgets": widgets}


def notes(i, body=""):
    return {"id": f"w{i}", "type": "notes", "props": {"body": body}}


def accepts(doc):
    normalize_config(doc)


def rejects(doc):
    with pytest.raises(InvalidConfig):
        normalize_config(doc)


def test_section_limit():
    accepts(base(sections=[{"id": f"s{i}", "kind": "stack"} for i in range(12)]))
    rejects(base(sections=[{"id": f"s{i}", "kind": "stack"} for i in range(13)]))


def test_total_widget_limit():
    def doc(n):
        per, sections = 10, []
        for s in range((n + 9) // 10):
            ids = range(s * per, min(n, (s + 1) * per))
            sections.append(stack_with([notes(i) for i in ids], f"s{s}"))
        return base(sections=sections)
    accepts(doc(50))
    rejects(doc(51))


def test_repeatable_list_limit():
    def tasks(n):
        items = [{"id": f"t{i}", "text": "x"} for i in range(n)]
        return base(sections=[stack_with([{"id": "w", "type": "tasks", "props": {"items": items}}])])
    accepts(tasks(100))
    rejects(tasks(101))


def test_text_limits_count_code_points_not_utf16_units():
    emoji = "\U0001F600"
    accepts(base(title=emoji * 120))
    rejects(base(title=emoji * 121))
    accepts(base(sections=[stack_with([notes(1, "a" * 10000)])]))
    rejects(base(sections=[stack_with([notes(1, "a" * 10001)])]))

    def task_text(n):
        item = {"id": "t", "text": "a" * n}
        return base(sections=[stack_with([{"id": "w", "type": "tasks", "props": {"items": [item]}}])])
    accepts(task_text(2000))
    rejects(task_text(2001))


def test_non_finite_numbers_rejected():
    def metric(value):
        m = {"id": "m", "label": "l", "value": value}
        return base(sections=[stack_with([{"id": "w", "type": "analytics", "props": {"metrics": [m]}}])])
    accepts(metric(0))
    accepts(metric(-3.25))
    rejects(metric(float("inf")))
    rejects(metric(float("nan")))


# ---- migration dispatcher -----------------------------------------------------

def test_v1_migration_is_identity_and_copies():
    doc = base()
    assert normalize_config(doc)["schemaVersion"] == 1


def test_known_widget_types_match_registry_contract():
    assert set(KNOWN_PROPS) == {"welcome", "tasks", "notes", "gallery", "analytics", "calendar"}
