"""Application settings, read from environment variables / backend/.env."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="FLEXSPACE_", extra="ignore")

    database_url: str = "sqlite:///./flexspace.db"
    # Exact Origin values allowed to make browser mutations (login, register, and all
    # authenticated POST/PUT/DELETE). Add the real https origin when deploying.
    allowed_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    # Session cookies are Secure by default. Set FLEXSPACE_COOKIE_SECURE=false only for
    # plain-HTTP localhost development (backend/.env.example does this).
    cookie_secure: bool = True
    session_cookie_name: str = "flexspace_session"
    session_ttl_hours: int = 8


@lru_cache
def get_settings() -> Settings:
    return Settings()
