from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, StrictStr, StringConstraints


class CreateTemplateRequest(BaseModel):
    """POST body. Unknown keys (e.g. ownerId) are rejected; the owner is the signed-in user."""

    model_config = ConfigDict(extra="forbid")

    name: Annotated[StrictStr, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
    config: Any


class TemplateSummary(BaseModel):
    id: str
    name: str
    kind: Literal["system", "custom"]
    updatedAt: datetime  # noqa: N815 - JSON names are camelCase


class TemplateDetail(TemplateSummary):
    config: dict[str, Any]


class TemplateList(BaseModel):
    items: list[TemplateSummary]
