"""The three curated system templates (Productivity, Analytics, Creative).

All three use the one config schema and the same widget registry; they differ in theme, navigation,
section kinds and content. Between them they cover grid and stack sections, all six widget types and
enough compatible containers to demonstrate every cross-container move (cards between stack sections,
tasks between Tasks widgets, tiles between Galleries). Productivity is also what a newly registered
user starts from, so its structure and ids are kept stable. Every config is passed through
``normalize_config`` before it is stored or served.
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
    """A KPI-focused design: two Analytics widgets, a calendar, and two Tasks widgets (one in the
    grid, one in a stack) so tasks can move between them; two stack sections to move cards between."""
    return {
        "schemaVersion": 1,
        "title": "Analytics workspace",
        "theme": {"primary": "#0ea5e9", "background": "#f1f5f9", "text": "#0f172a"},
        "navigation": {
            "placement": "top",
            "primaryItems": [
                _nav("section-overview", "Overview", "bar-chart"),
                _nav("section-reports", "Reports", "layout-dashboard"),
            ],
            "secondaryItems": [_nav("section-notes", "Notes", "notebook")],
        },
        "sections": [
            {"id": "section-overview", "kind": "grid", "title": "Overview", "widgets": [
                _widget("w-overview", "welcome", "Overview", {
                    "greeting": "Performance overview", "subtitle": "Sample data for this quarter."}),
                _widget("w-kpis", "analytics", "Key metrics", {"metrics": [
                    {"id": "metric-visitors", "label": "Visitors", "value": 12400},
                    {"id": "metric-signups", "label": "Signups", "value": 860},
                    {"id": "metric-revenue", "label": "Revenue ($)", "value": 48200},
                    {"id": "metric-conversion", "label": "Conversion %", "value": 6.9}]}),
                _widget("w-engagement", "analytics", "Engagement", {"metrics": [
                    {"id": "metric-sessions", "label": "Sessions", "value": 9300},
                    {"id": "metric-pages", "label": "Pages per visit", "value": 3.4},
                    {"id": "metric-duration", "label": "Avg. session (min)", "value": 4.2},
                    {"id": "metric-bounce", "label": "Bounce rate %", "value": 38}]}),
                _widget("w-followups", "tasks", "Follow-ups", {"items": [
                    {"id": "task-signups", "text": "Investigate the signup dip on Tuesday", "done": False},
                    {"id": "task-funnel", "text": "Review the onboarding funnel", "done": True},
                    {"id": "task-report", "text": "Send the weekly report", "done": False},
                    {"id": "task-forecast", "text": "Update the quarterly forecast", "done": False},
                    {"id": "task-filters", "text": "Tidy the dashboard filters", "done": False}]}),
                _widget("w-reporting", "calendar", "Reporting calendar", {"displayMonth": "2026-11", "events": [
                    {"id": "event-board", "date": "2026-11-19", "title": "Board review"},
                    {"id": "event-close", "date": "2026-11-30", "title": "Quarter close"},
                    {"id": "event-kickoff", "date": "2026-12-02", "title": "Planning kickoff"}]}),
            ], "layout": [_rect("w-overview", 0, 0, 12, 3), _rect("w-kpis", 0, 3, 7, 6),
                          _rect("w-engagement", 7, 3, 5, 6), _rect("w-followups", 0, 9, 6, 9),
                          _rect("w-reporting", 6, 9, 6, 9)]},
            {"id": "section-reports", "kind": "stack", "title": "Reports", "widgets": [
                _widget("w-next-steps", "tasks", "Next steps", {"items": [
                    {"id": "task-experiment", "text": "Plan the pricing experiment", "done": False},
                    {"id": "task-dashboard", "text": "Share the dashboard with sales", "done": False}]}),
                _widget("w-findings", "notes", "Findings", {
                    "body": "Conversion improved after the new onboarding.\nMobile traffic grew faster than desktop."})]},
            {"id": "section-notes", "kind": "stack", "title": "Notes", "widgets": [
                _widget("w-method", "notes", "Methodology", {
                    "body": "Figures are sample data.\nVisitors are unique per week."}),
                _widget("w-glossary", "notes", "Glossary", {
                    "body": "Conversion % = signups / visitors.\nBounce rate = single-page sessions / sessions."})]},
        ],
    }


def _creative() -> dict[str, Any]:
    """An image-focused design: two Galleries side by side (tiles can move between them), a third in a
    stack, two Tasks widgets and a calendar spread over a grid and two stack sections."""
    return {
        "schemaVersion": 1,
        "title": "Creative workspace",
        "theme": {"primary": "#db2777", "background": "#fdf2f8", "fontFamily": "serif"},
        "navigation": {
            "placement": "right",
            "primaryItems": [_nav("section-studio", "Studio", "image"), _nav("section-ideas", "Ideas", "star")],
            "secondaryItems": [_nav("section-archive", "Archive", "folder")],
        },
        "sections": [
            {"id": "section-studio", "kind": "grid", "title": "Studio", "widgets": [
                _widget("w-studio", "welcome", "Studio", {
                    "greeting": "Let's make something", "subtitle": "Collect inspiration and ideas."}),
                _widget("w-sketchbook", "notes", "Sketchbook", {
                    "body": "Palette: magenta, cream, charcoal.\nTry a serif headline."}),
                _widget("w-inspiration", "gallery", "Inspiration", {"items": [
                    {"id": "img-aurora", "assetKey": "aurora", "alt": "Aurora over mountains", "caption": "Colour study"},
                    {"id": "img-mountain", "assetKey": "mountain", "alt": "Snowy mountain at sunrise", "caption": "Warm light"},
                    {"id": "img-forest", "assetKey": "forest", "alt": "Pine forest", "caption": "Texture"}]}),
                _widget("w-moodboard", "gallery", "Mood board", {"items": [
                    {"id": "img-studio", "assetKey": "studio", "alt": "Desk with sketches", "caption": "Workspace"},
                    {"id": "img-city", "assetKey": "city", "alt": "City skyline at dusk", "caption": "Evening mood"},
                    {"id": "img-desk", "assetKey": "workspace", "alt": "Laptop on a desk", "caption": "Digital tools"}]}),
                _widget("w-todo", "tasks", "Studio to-do", {"items": [
                    {"id": "task-prints", "text": "Order test prints", "done": True},
                    {"id": "task-palette", "text": "Finalise the colour palette", "done": False},
                    {"id": "task-layout", "text": "Sketch three poster layouts", "done": False}]}),
            ], "layout": [_rect("w-studio", 0, 0, 8, 4), _rect("w-sketchbook", 8, 0, 4, 4),
                          _rect("w-inspiration", 0, 4, 6, 7), _rect("w-moodboard", 6, 4, 6, 7),
                          _rect("w-todo", 0, 11, 12, 6)]},
            {"id": "section-ideas", "kind": "stack", "title": "Ideas", "widgets": [
                _widget("w-ideas", "tasks", "Ideas to try", {"items": [
                    {"id": "task-poster", "text": "Poster series", "done": False},
                    {"id": "task-zine", "text": "A small zine of sketches", "done": False},
                    {"id": "task-colour", "text": "Risograph colour tests", "done": False}]}),
                _widget("w-schedule", "calendar", "Exhibition schedule", {"displayMonth": "2026-12", "events": [
                    {"id": "event-install", "date": "2026-12-04", "title": "Gallery install"},
                    {"id": "event-opening", "date": "2026-12-11", "title": "Opening night"},
                    {"id": "event-talk", "date": "2026-12-18", "title": "Artist talk"}]})]},
            {"id": "section-archive", "kind": "stack", "title": "Archive", "widgets": [
                _widget("w-archive", "gallery", "Past shots", {"items": [
                    {"id": "img-old-city", "assetKey": "city", "alt": "City skyline", "caption": "Last year"},
                    {"id": "img-old-forest", "assetKey": "forest", "alt": "Pine forest", "caption": "Field trip"}]}),
                _widget("w-past", "notes", "Past projects", {
                    "body": "2025: Seasons poster set\n2024: Neighbourhood map"})]},
        ],
    }


_BUILDERS = {PRODUCTIVITY: _productivity, ANALYTICS: _analytics, CREATIVE: _creative}


def starter_config(system_key: str) -> dict[str, Any]:
    """A fresh, validated and normalized copy of a system template's config."""
    return normalize_config(_BUILDERS[system_key]())


def default_workspace_config() -> dict[str, Any]:
    """The config a newly registered user's workspace starts from (the Productivity template)."""
    return starter_config(PRODUCTIVITY)
