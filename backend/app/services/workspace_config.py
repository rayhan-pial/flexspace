"""Migration dispatch and normalization for workspace configuration documents."""

import copy
from collections.abc import Callable
from typing import Any

from pydantic import ValidationError

from app.schemas.config import SCHEMA_VERSION, WorkspaceConfig


class InvalidConfig(Exception):
    """The document violates the current schema (API code ``invalid_config``)."""

    def __init__(self, errors: list[dict[str, Any]] | str):
        super().__init__(str(errors))
        self.errors = errors


class UnsupportedSchemaVersion(Exception):
    """The document is newer than this build understands (``unsupported_schema_version``)."""


# Pure sequential migrations: MIGRATIONS[n] upgrades a copy from vN to vN+1.
# Empty today; no fake v0 exists.
MIGRATIONS: dict[int, Callable[[dict[str, Any]], dict[str, Any]]] = {}


def migrate_config(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise InvalidConfig("configuration must be a JSON object")
    version = raw.get("schemaVersion")
    if isinstance(version, bool) or not isinstance(version, int) or version < 1:
        raise InvalidConfig("schemaVersion must be a positive integer")
    if version > SCHEMA_VERSION:
        raise UnsupportedSchemaVersion(f"schema version {version} is not supported")
    doc = copy.deepcopy(raw)
    while version < SCHEMA_VERSION:
        doc = MIGRATIONS[version](doc)
        version += 1
        doc["schemaVersion"] = version
    return doc


def normalize_config(raw: Any) -> dict[str, Any]:
    """Migrate, validate and fill documented defaults. Never mutates ``raw``."""
    doc = migrate_config(raw)
    try:
        config = WorkspaceConfig.model_validate(doc)
    except ValidationError as exc:
        raise InvalidConfig(
            exc.errors(include_url=False, include_context=False, include_input=False)
        ) from exc
    out = config.model_dump(by_alias=True, mode="json")
    for section in out["sections"]:
        if section["layout"] is None:
            del section["layout"]
    return out
