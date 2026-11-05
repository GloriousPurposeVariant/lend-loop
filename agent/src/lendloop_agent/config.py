from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Everything the agent reads from its environment, checked once at startup.

    A missing or malformed value stops the service with a clear error, instead of
    failing later in the middle of a request.
    """

    model_config = SettingsConfigDict(env_prefix="AGENT_", extra="ignore")

    database_url: str = Field(description="Postgres URL of agent-db.")
    # Who signs the tokens we accept (Clerk's Frontend API URL), and for whom.
    jwt_issuer: str = Field(description="Clerk issuer, e.g. https://x.clerk.accounts.dev")
    jwt_audience: str = "convex"
    log_level: str = "INFO"
    # Browser origins allowed to call agent-api (the Next.js app).
    cors_origins: list[str] = ["http://localhost:3000"]


@lru_cache
def get_settings() -> Settings:
    return Settings()  # pyright: ignore[reportCallIssue]  # values come from the environment
