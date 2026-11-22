from typing import Any

from fastapi import APIRouter, Depends
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, get_current_auth, read_json_body, require_csrf
from app.core.errors import ApiError, sanitize_errors
from app.db.engine import get_session
from app.db.models import Workspace
from app.schemas.workspace import SaveWorkspaceRequest, WorkspaceResponse
from app.services import workspace_service as service
from app.services.workspace_config import InvalidConfig, UnsupportedSchemaVersion

router = APIRouter(prefix="/api/workspace", tags=["workspace"])


def _envelope(workspace: Workspace, config: dict[str, Any]) -> WorkspaceResponse:
    return WorkspaceResponse(id=workspace.id, revision=workspace.revision, updatedAt=workspace.updated_at, config=config)


def _translate(exc: Exception) -> ApiError:
    if isinstance(exc, UnsupportedSchemaVersion):
        return ApiError(422, "unsupported_schema_version", "This workspace was saved by a newer version and cannot be opened.")
    if isinstance(exc, InvalidConfig):
        return ApiError(422, "invalid_config", "The workspace configuration is not valid.", {"errors": sanitize_errors(exc.errors)})
    if isinstance(exc, service.ConfigTooLarge):
        return ApiError(413, "payload_too_large", "The workspace configuration exceeds 1 MiB.")
    if isinstance(exc, service.RevisionConflict):
        return ApiError(409, "revision_conflict", "The workspace was changed elsewhere.", {"currentRevision": exc.current_revision})
    if isinstance(exc, service.WorkspaceMissing):
        return ApiError(404, "not_found", "Workspace not found.")
    raise exc


@router.get("", response_model=WorkspaceResponse)
def read_workspace(auth: AuthContext = Depends(get_current_auth), db: Session = Depends(get_session)):
    try:
        workspace, config = service.load_workspace(db, auth.user.id)
    except (InvalidConfig, UnsupportedSchemaVersion, service.WorkspaceMissing) as exc:
        raise _translate(exc) from exc
    return _envelope(workspace, config)


@router.put("", response_model=WorkspaceResponse)
def save_workspace(
    auth: AuthContext = Depends(require_csrf),  # first: session, Origin and CSRF before reading the body
    payload: Any = Depends(read_json_body),
    db: Session = Depends(get_session),
):
    try:
        body = SaveWorkspaceRequest.model_validate(payload)
    except ValidationError as exc:
        raise ApiError(422, "validation_error", "The request is not valid.",
                       {"errors": sanitize_errors(exc.errors(include_url=False, include_context=False, include_input=False))}) from exc
    try:
        workspace, config = service.save_workspace(db, auth.user.id, body.baseRevision, body.config)
    except (InvalidConfig, UnsupportedSchemaVersion, service.ConfigTooLarge,
            service.RevisionConflict, service.WorkspaceMissing) as exc:
        raise _translate(exc) from exc
    return _envelope(workspace, config)
