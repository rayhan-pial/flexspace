from typing import Any

from fastapi import APIRouter, Depends, Response
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, get_current_auth, read_json_body, require_csrf
from app.api.translate import DOMAIN_ERRORS, translate_error
from app.core.errors import ApiError, sanitize_errors
from app.db.engine import get_session
from app.db.models import Template
from app.schemas.templates import CreateTemplateRequest, TemplateDetail, TemplateList, TemplateSummary
from app.services import templates_service as service

router = APIRouter(prefix="/api/templates", tags=["templates"])


def _summary(template: Template) -> TemplateSummary:
    return TemplateSummary(id=template.id, name=template.name, kind=service.kind_of(template), updatedAt=template.updated_at)


def _detail(template: Template, config: dict[str, Any]) -> TemplateDetail:
    return TemplateDetail(**_summary(template).model_dump(), config=config)


@router.get("", response_model=TemplateList)
def list_templates(auth: AuthContext = Depends(get_current_auth), db: Session = Depends(get_session)):
    return TemplateList(items=[_summary(t) for t in service.list_templates(db, auth.user.id)])


@router.get("/{template_id}", response_model=TemplateDetail)
def read_template(template_id: str, auth: AuthContext = Depends(get_current_auth), db: Session = Depends(get_session)):
    try:
        template, config = service.get_template(db, auth.user.id, template_id)
    except DOMAIN_ERRORS as exc:
        raise translate_error(exc) from exc
    return _detail(template, config)


@router.post("", status_code=201, response_model=TemplateDetail)
def create_template(
    auth: AuthContext = Depends(require_csrf),  # first: session, Origin and CSRF before reading the body
    payload: Any = Depends(read_json_body),
    db: Session = Depends(get_session),
):
    try:
        body = CreateTemplateRequest.model_validate(payload)
    except ValidationError as exc:
        raise ApiError(422, "validation_error", "The request is not valid.",
                       {"errors": sanitize_errors(exc.errors(include_url=False, include_context=False, include_input=False))}) from exc
    try:
        template, config = service.create_template(db, auth.user.id, body.name, body.config)
    except DOMAIN_ERRORS as exc:
        raise translate_error(exc) from exc
    return _detail(template, config)


@router.delete("/{template_id}", status_code=204)
def remove_template(template_id: str, auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_session)):
    try:
        service.delete_template(db, auth.user.id, template_id)
    except DOMAIN_ERRORS as exc:
        raise translate_error(exc) from exc
    return Response(status_code=204)
