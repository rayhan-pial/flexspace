"""Workspace configuration v1 (see docs/architecture.md section 3).

JSON uses camelCase names. Outer structures and known widget props are strict
(unknown keys rejected). Unknown widget *types* keep their ``props`` and
``appearance`` as opaque JSON objects. Constants here are mirrored in
frontend/src/domain/workspace/constants.ts; shared fixtures in contracts/ keep
the two implementations in agreement.
"""

import datetime
from typing import Annotated, Any, Literal

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    Field,
    StrictBool,
    StrictFloat,
    StrictInt,
    StrictStr,
    StringConstraints,
    model_validator,
)
from pydantic.alias_generators import to_camel

SCHEMA_VERSION = 1

MAX_SECTIONS = 12
MAX_WIDGETS = 50
MAX_LIST_ITEMS = 100
MAX_LABEL = 120
MAX_TEXT = 2000
MAX_BODY = 10000
GRID_COLUMNS = 12
MAX_ROW_H = 24
DEFAULT_DISPLAY_MONTH = "2026-01"

ICONS = ("home", "layout-dashboard", "check-square", "notebook", "image", "bar-chart",
         "calendar", "settings", "star", "folder", "users", "mail")
ASSET_KEYS = ("aurora", "workspace", "mountain", "studio", "forest", "city")
# Per-type minimum grid size (w, h); unknown types only get the global minimum (1, 2).
MIN_SIZE: dict[str, tuple[int, int]] = {
    "welcome": (3, 2), "tasks": (3, 4), "notes": (3, 3),
    "gallery": (4, 4), "analytics": (4, 3), "calendar": (4, 5),
}
DEFAULT_MIN_SIZE = (1, 2)


def _valid_date(value: str) -> str:
    try:
        datetime.date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError("not a real calendar date") from exc
    return value


def _valid_month(value: str) -> str:
    if not "01" <= value[5:7] <= "12":
        raise ValueError("month must be 01-12")
    return value


Id = Annotated[StrictStr, StringConstraints(pattern=r"^[A-Za-z0-9_-]{1,64}$")]
Label = Annotated[StrictStr, StringConstraints(max_length=MAX_LABEL)]
Text = Annotated[StrictStr, StringConstraints(max_length=MAX_TEXT)]
Body = Annotated[StrictStr, StringConstraints(max_length=MAX_BODY)]
Color = Annotated[StrictStr, StringConstraints(pattern=r"^#[0-9a-fA-F]{6}$")]
IsoDate = Annotated[
    StrictStr,
    StringConstraints(pattern=r"^(19|20|21)[0-9]{2}-[0-9]{2}-[0-9]{2}$"),
    AfterValidator(_valid_date),
]
IsoMonth = Annotated[
    StrictStr,
    StringConstraints(pattern=r"^(19|20|21)[0-9]{2}-[0-9]{2}$"),
    AfterValidator(_valid_month),
]
Number = StrictInt | Annotated[StrictFloat, Field(allow_inf_nan=False)]


def bounded(model: type[BaseModel]):
    return Annotated[list[model], Field(max_length=MAX_LIST_ITEMS)]


class _Model(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, extra="forbid")


# ---- widget props ---------------------------------------------------------

class WelcomeProps(_Model):
    greeting: Text = ""
    subtitle: Text = ""


class TaskItem(_Model):
    id: Id
    text: Text
    done: StrictBool = False


class TasksProps(_Model):
    items: bounded(TaskItem) = Field(default_factory=list)


class NotesProps(_Model):
    body: Body = ""


# A gallery item shows either a bundled picture ("aurora") or one the user uploaded ("upload:<image id>").
UploadKey = Annotated[StrictStr, StringConstraints(pattern=r"^upload:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")]


class GalleryItem(_Model):
    id: Id
    asset_key: Literal[ASSET_KEYS] | UploadKey
    alt: Text = ""
    caption: Text = ""


class GalleryProps(_Model):
    items: bounded(GalleryItem) = Field(default_factory=list)


class Metric(_Model):
    id: Id
    label: Label
    value: Number


class AnalyticsProps(_Model):
    metrics: bounded(Metric) = Field(default_factory=list)


class CalendarEvent(_Model):
    id: Id
    date: IsoDate
    title: Label


class CalendarProps(_Model):
    display_month: IsoMonth = DEFAULT_DISPLAY_MONTH
    events: bounded(CalendarEvent) = Field(default_factory=list)


KNOWN_PROPS: dict[str, type[_Model]] = {
    "welcome": WelcomeProps, "tasks": TasksProps, "notes": NotesProps,
    "gallery": GalleryProps, "analytics": AnalyticsProps, "calendar": CalendarProps,
}
# Props key holding each type's repeatable items (all carry globally unique ids).
ITEM_LISTS = {"tasks": "items", "gallery": "items", "analytics": "metrics", "calendar": "events"}


# ---- structure ------------------------------------------------------------

class Appearance(_Model):
    background: Color | None = None
    text: Color | None = None
    font_size_px: Annotated[StrictInt, Field(ge=12, le=24)] | None = None


class Widget(_Model):
    id: Id
    type: Annotated[StrictStr, StringConstraints(min_length=1, max_length=64)]
    title: Label = ""
    hidden: StrictBool = False
    appearance: dict[str, Any] = Field(default_factory=dict)
    props: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def _dispatch_by_type(self):
        spec = KNOWN_PROPS.get(self.type)
        if spec is not None:  # known types never escape via the unknown branch
            self.appearance = Appearance.model_validate(self.appearance).model_dump(
                by_alias=True, exclude_none=True)
            self.props = spec.model_validate(self.props).model_dump(by_alias=True)
        return self


class Rect(_Model):
    i: Id
    x: Annotated[StrictInt, Field(ge=0)]
    y: Annotated[StrictInt, Field(ge=0)]
    w: Annotated[StrictInt, Field(ge=1, le=GRID_COLUMNS)]
    h: Annotated[StrictInt, Field(ge=2, le=MAX_ROW_H)]

    @model_validator(mode="after")
    def _within_columns(self):
        if self.x + self.w > GRID_COLUMNS:
            raise ValueError("x + w exceeds 12 columns")
        return self


def _overlap(a: Rect, b: Rect) -> bool:
    return a.x < b.x + b.w and b.x < a.x + a.w and a.y < b.y + b.h and b.y < a.y + a.h


class Section(_Model):
    id: Id
    kind: Literal["grid", "stack"]
    title: Label = ""
    hidden: StrictBool = False
    widgets: bounded(Widget) = Field(default_factory=list)
    layout: bounded(Rect) | None = None

    @model_validator(mode="after")
    def _check_layout(self):
        if self.kind == "stack":
            if self.layout is not None:
                raise ValueError("stack sections have no layout")
            return self
        if self.layout is None:
            self.layout = []
        by_id: dict[str, Rect] = {}
        for rect in self.layout:
            if rect.i in by_id:
                raise ValueError(f"duplicate layout rectangle for {rect.i}")
            by_id[rect.i] = rect
        widgets = {w.id: w for w in self.widgets}
        if set(by_id) != set(widgets) or len(widgets) != len(self.widgets):
            raise ValueError("grid widgets and layout rectangles must match one to one")
        for wid, rect in by_id.items():
            min_w, min_h = MIN_SIZE.get(widgets[wid].type, DEFAULT_MIN_SIZE)
            if rect.w < min_w or rect.h < min_h:
                raise ValueError(f"{wid} is smaller than the {widgets[wid].type} minimum")
        visible = [by_id[w.id] for w in self.widgets if not w.hidden]
        for n, a in enumerate(visible):
            if any(_overlap(a, b) for b in visible[n + 1:]):
                raise ValueError(f"visible widget {a.i} overlaps another")
        return self


class Theme(_Model):
    primary: Color = "#6366f1"
    background: Color = "#f8fafc"
    surface: Color = "#ffffff"
    text: Color = "#0f172a"
    font_family: Literal["system", "serif", "mono"] = "system"
    font_size_px: Annotated[StrictInt, Field(ge=12, le=20)] = 16


class NavItem(_Model):
    id: Id
    label: Label
    target_section_id: Id | None = None
    icon: Literal[ICONS] = "home"


class Navigation(_Model):
    placement: Literal["top", "left", "right"] = "left"
    primary_items: bounded(NavItem) = Field(default_factory=list)
    secondary_items: bounded(NavItem) = Field(default_factory=list)


class WorkspaceConfig(_Model):
    schema_version: Literal[1]
    title: Label
    theme: Theme = Field(default_factory=Theme)
    navigation: Navigation = Field(default_factory=Navigation)
    sections: Annotated[list[Section], Field(max_length=MAX_SECTIONS)] = Field(default_factory=list)

    @model_validator(mode="after")
    def _document_invariants(self):
        seen: set[str] = set()

        def claim(entity_id: str) -> None:
            if entity_id in seen:
                raise ValueError(f"duplicate id {entity_id}")
            seen.add(entity_id)

        widget_count = 0
        nav_items = (*self.navigation.primary_items, *self.navigation.secondary_items)
        for nav in nav_items:
            claim(nav.id)
        for section in self.sections:
            claim(section.id)
            for widget in section.widgets:
                widget_count += 1
                claim(widget.id)
                key = ITEM_LISTS.get(widget.type)
                for entry in widget.props.get(key, []) if key else []:
                    claim(entry["id"])
        if widget_count > MAX_WIDGETS:
            raise ValueError(f"more than {MAX_WIDGETS} widgets")
        section_ids = {s.id for s in self.sections}
        for nav in nav_items:
            if nav.target_section_id is not None and nav.target_section_id not in section_ids:
                raise ValueError(f"navigation target {nav.target_section_id} does not exist")
        return self
