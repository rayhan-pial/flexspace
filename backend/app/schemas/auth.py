from pydantic import BaseModel, ConfigDict, Field


class Credentials(BaseModel):
    """Register/login body. Semantic limits are enforced by the auth service; this only bounds size."""

    model_config = ConfigDict(extra="forbid")

    email: str = Field(max_length=1024)
    password: str = Field(max_length=1024)


class UserOut(BaseModel):
    id: str
    email: str


class AuthResponse(BaseModel):
    user: UserOut
    csrfToken: str  # noqa: N815 - JSON names are camelCase
