"""Map domain exceptions to API errors (one mapping shared by workspace and template routes)."""

from app.core.errors import ApiError, sanitize_errors
from app.services import templates_service, workspace_service
from app.services.workspace_config import InvalidConfig, UnsupportedSchemaVersion


def translate_error(exc: Exception) -> ApiError:
    """Return the ApiError for a known domain exception; re-raise anything unexpected."""
    if isinstance(exc, UnsupportedSchemaVersion):
        return ApiError(422, "unsupported_schema_version", "This configuration was saved by a newer version and cannot be opened.")
    if isinstance(exc, InvalidConfig):
        return ApiError(422, "invalid_config", "The configuration is not valid.", {"errors": sanitize_errors(exc.errors)})
    if isinstance(exc, workspace_service.ConfigTooLarge):
        return ApiError(413, "payload_too_large", "The configuration exceeds 1 MiB.")
    if isinstance(exc, workspace_service.RevisionConflict):
        return ApiError(409, "revision_conflict", "The workspace was changed elsewhere.", {"currentRevision": exc.current_revision})
    if isinstance(exc, workspace_service.WorkspaceMissing):
        return ApiError(404, "not_found", "Workspace not found.")
    if isinstance(exc, templates_service.TemplateNotFound):
        return ApiError(404, "not_found", "Template not found.")
    if isinstance(exc, templates_service.SystemTemplateReadOnly):
        return ApiError(403, "system_template_read_only", "System templates cannot be deleted.")
    raise exc


DOMAIN_ERRORS = (
    UnsupportedSchemaVersion, InvalidConfig, workspace_service.ConfigTooLarge,
    workspace_service.RevisionConflict, workspace_service.WorkspaceMissing,
    templates_service.TemplateNotFound, templates_service.SystemTemplateReadOnly,
)
