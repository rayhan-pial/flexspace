"""Starter configs for the three system templates.

These are valid, distinct placeholders; FS-024 replaces them with the curated designs.
Every config is passed through ``normalize_config`` before it is stored.
"""

from typing import Any

from app.services.workspace_config import normalize_config

PRODUCTIVITY = "productivity"
ANALYTICS = "analytics"
CREATIVE = "creative"

# system_key -> display name, in listing order. Restore default is always PRODUCTIVITY.
SYSTEM_TEMPLATE_NAMES = {PRODUCTIVITY: "Productivity", ANALYTICS: "Analytics", CREATIVE: "Creative"}


def _widget(wid: str, wtype: str, title: str, props: dict[str, Any]) -> dict[str, Any]:
    return {"id": wid, "type": wtype, "title": title, "props": props}


def _rect(i: str, x: int, y: int, w: int, h: int) -> dict[str, int | str]:
    return {"i": i, "x": x, "y": y, "w": w, "h": h}


def _nav(section_id: str, label: str, icon: str) -> dict[str, Any]:
    return {"id": f"nav-{section_id}", "label": label, "targetSectionId": section_id, "icon": icon}


def _productivity() -> dict[str, Any]:
    return {
        "schemaVersion": 1,
        "title": "My workspace",
        "navigation": {"placement": "left", "primaryItems": [
            _nav("section-today", "Today", "home"), _nav("section-reference", "Reference", "folder")]},
        "sections": [
            {"id": "section-today", "kind": "grid", "title": "Today", "widgets": [
                _widget("w-welcome", "welcome", "Welcome", {
                    "greeting": "Welcome back", "subtitle": "Here is what is on your plate today."}),
                _widget("w-tasks", "tasks", "Tasks", {"items": [
                    {"id": "task-1", "text": "Review project brief", "done": True},
                    {"id": "task-2", "text": "Draft the weekly update", "done": False},
                    {"id": "task-3", "text": "Prepare the demo", "done": False}]}),
                _widget("w-notes", "notes", "Notes", {"body": "Keep the demo focused:\nbuild, save, log in again."}),
                _widget("w-calendar", "calendar", "Calendar", {"displayMonth": "2026-11", "events": [
                    {"id": "event-1", "date": "2026-11-24", "title": "Planning session"},
                    {"id": "event-2", "date": "2026-11-27", "title": "Demo day"}]}),
            ], "layout": [_rect("w-welcome", 0, 0, 12, 3), _rect("w-tasks", 0, 3, 6, 6),
                          _rect("w-notes", 6, 3, 6, 6), _rect("w-calendar", 0, 9, 12, 7)]},
            {"id": "section-reference", "kind": "stack", "title": "Reference", "widgets": [
                _widget("w-ref-notes", "notes", "Reading list", {"body": "Architecture notes\nTeam handbook"})]},
        ],
    }


def _analytics() -> dict[str, Any]:
    return {
        "schemaVersion": 1,
        "title": "Analytics workspace",
        "theme": {"primary": "#0ea5e9", "background": "#f1f5f9", "text": "#0f172a"},
        "navigation": {"placement": "top", "primaryItems": [
            _nav("section-metrics", "Metrics", "bar-chart"), _nav("section-notes", "Notes", "notebook")]},
        "sections": [
            {"id": "section-metrics", "kind": "grid", "title": "Metrics", "widgets": [
                _widget("w-welcome", "welcome", "Overview", {
                    "greeting": "Performance overview", "subtitle": "Sample data for this quarter."}),
                _widget("w-analytics", "analytics", "Key metrics", {"metrics": [
                    {"id": "metric-1", "label": "Visitors", "value": 12400},
                    {"id": "metric-2", "label": "Signups", "value": 860},
                    {"id": "metric-3", "label": "Conversion %", "value": 6.9}]}),
                _widget("w-tasks", "tasks", "Follow-ups", {"items": [
                    {"id": "task-1", "text": "Investigate signup drop", "done": False}]}),
            ], "layout": [_rect("w-welcome", 0, 0, 12, 3), _rect("w-analytics", 0, 3, 8, 6),
                          _rect("w-tasks", 8, 3, 4, 6)]},
            {"id": "section-notes", "kind": "stack", "title": "Notes", "widgets": [
                _widget("w-notes", "notes", "Findings", {"body": "Conversion improved after the new onboarding."})]},
        ],
    }


def _creative() -> dict[str, Any]:
    return {
        "schemaVersion": 1,
        "title": "Creative workspace",
        "theme": {"primary": "#db2777", "background": "#fdf2f8", "fontFamily": "serif"},
        "navigation": {"placement": "right", "primaryItems": [
            _nav("section-studio", "Studio", "image"), _nav("section-ideas", "Ideas", "star")]},
        "sections": [
            {"id": "section-studio", "kind": "grid", "title": "Studio", "widgets": [
                _widget("w-welcome", "welcome", "Studio", {
                    "greeting": "Let's make something", "subtitle": "Collect inspiration and ideas."}),
                _widget("w-gallery", "gallery", "Inspiration", {"items": [
                    {"id": "img-1", "assetKey": "aurora", "alt": "Aurora over mountains", "caption": "Colour study"},
                    {"id": "img-2", "assetKey": "studio", "alt": "Desk with sketches", "caption": "Workspace"}]}),
                _widget("w-notes", "notes", "Sketchbook", {"body": "Palette: magenta, cream, charcoal."}),
            ], "layout": [_rect("w-welcome", 0, 0, 8, 3), _rect("w-gallery", 0, 3, 12, 8),
                          _rect("w-notes", 8, 0, 4, 3)]},
            {"id": "section-ideas", "kind": "stack", "title": "Ideas", "widgets": [
                _widget("w-ideas", "tasks", "Ideas to try", {"items": [
                    {"id": "task-1", "text": "Poster series", "done": False}]})]},
        ],
    }


_BUILDERS = {PRODUCTIVITY: _productivity, ANALYTICS: _analytics, CREATIVE: _creative}


def starter_config(system_key: str) -> dict[str, Any]:
    """A fresh, validated and normalized copy of a system template's config."""
    return normalize_config(_BUILDERS[system_key]())


def default_workspace_config() -> dict[str, Any]:
    """The config a newly registered user's workspace starts from (the Productivity template)."""
    return starter_config(PRODUCTIVITY)
