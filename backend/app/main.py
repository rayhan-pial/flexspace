from fastapi import FastAPI, Request

from app.api import auth, health, images, templates, workspace
from app.core.errors import install_error_handlers


def create_app() -> FastAPI:
    app = FastAPI(title="FlexSpace API", docs_url="/api/docs", openapi_url="/api/openapi.json")
    install_error_handlers(app)

    @app.middleware("http")
    async def private_responses_are_not_cached(request: Request, call_next):
        response = await call_next(request)
        path = request.url.path
        if path.startswith("/api/") and path != "/api/health" and not path.startswith(("/api/docs", "/api/openapi")):
            response.headers["Cache-Control"] = "no-store"
        return response

    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(workspace.router)
    app.include_router(templates.router)
    app.include_router(images.router)
    return app


app = create_app()
