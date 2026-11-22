from fastapi import FastAPI

from app.api import health


def create_app() -> FastAPI:
    app = FastAPI(title="FlexSpace API", docs_url="/api/docs", openapi_url="/api/openapi.json")
    app.include_router(health.router)
    return app


app = create_app()
