from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, StrictInt, Field


class SaveWorkspaceRequest(BaseModel):
    """PUT body. Unknown keys (e.g. userId/ownerId) are rejected; ownership comes from the session."""

    model_config = ConfigDict(extra="forbid")

    baseRevision: StrictInt = Field(ge=1)  # noqa: N815 - JSON names are camelCase
    config: Any


class WorkspaceResponse(BaseModel):
    id: str
    revision: int
    updatedAt: datetime  # noqa: N815
    config: dict[str, Any]
