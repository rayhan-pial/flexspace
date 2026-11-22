from typing import Any

from fastapi import APIRouter, Depends
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, get_current_auth, read_json_body, require_csrf
from app.api.translate import DOMAIN_ERRORS, translate_error
from app.core.errors import ApiError, sanitize_errors
from app.db.engine import get_session
from app.db.models import Workspace
from app.schemas.workspace import SaveWorkspaceRequest, WorkspaceResponse
from app.services import workspace_service as service

router = APIRouter(prefix="/api/workspace", tags=["workspace"])


def _envelope(workspace: Workspace, config: dict[str, Any]) -> WorkspaceResponse:
    return WorkspaceResponse(id=workspace.id, revision=workspace.revision, updatedAt=workspace.updated_at, config=config)


@router.get("", response_model=WorkspaceResponse)
def read_workspace(auth: AuthContext = Depends(get_current_auth), db: Session = Depends(get_session)):
    try:
        workspace, config = service.load_workspace(db, auth.user.id)
    except DOMAIN_ERRORS as exc:
        raise translate_error(exc) from exc
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
    except DOMAIN_ERRORS as exc:
        raise translate_error(exc) from exc
    return _envelope(workspace, config)
