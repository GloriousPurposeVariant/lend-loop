from functools import lru_cache

from pydantic import AliasChoices, Field, SecretStr
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

    # LendLoop's Convex backend, called by the MCP tools as the signed-in member.
    convex_url: str = "http://convex-backend:3210"
    # Host names agent-mcp answers to; requests naming any other host are refused
    # (DNS rebinding protection). A JSON list, e.g. '["mcp.example.com"]'.
    mcp_allowed_hosts: list[str] = ["agent-mcp:8001", "localhost:8001", "127.0.0.1:8001"]

    # Default models, "provider:model", used until `lendloop-agent models use` picks one.
    model: str | None = None
    fast_model: str | None = None

    # Provider keys, under the names each provider's own tools use. Only the providers
    # you use need one; Ollama runs locally and needs none.
    anthropic_api_key: SecretStr | None = Field(
        default=None, validation_alias=AliasChoices("ANTHROPIC_API_KEY")
    )
    openai_api_key: SecretStr | None = Field(
        default=None, validation_alias=AliasChoices("OPENAI_API_KEY")
    )
    google_api_key: SecretStr | None = Field(
        default=None, validation_alias=AliasChoices("GOOGLE_API_KEY")
    )
    ollama_base_url: str = Field(
        default="http://ollama:11434", validation_alias=AliasChoices("OLLAMA_BASE_URL")
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()  # pyright: ignore[reportCallIssue]  # values come from the environment
