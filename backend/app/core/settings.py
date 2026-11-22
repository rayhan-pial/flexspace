"""Application settings, read from environment variables / backend/.env."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="FLEXSPACE_", extra="ignore")

    database_url: str = "sqlite:///./flexspace.db"
    # Origins allowed to make browser mutations (used from FS-005 onward).
    allowed_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    # Session cookies are Secure unless explicitly disabled for plain-HTTP localhost.
    cookie_secure: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
