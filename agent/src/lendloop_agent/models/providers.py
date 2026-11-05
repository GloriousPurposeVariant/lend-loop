from dataclasses import dataclass

import httpx

from lendloop_agent.config import Settings

# Seconds to wait for a provider's model list before giving up.
_LIST_TIMEOUT = 10.0


class ModelSpecError(ValueError):
    pass


@dataclass(frozen=True)
class ModelSpec:
    """A model written as "provider:model".

    Examples: "ollama:qwen3:4b", "anthropic:claude-haiku-5-5". Only the first colon
    separates the two, because Ollama model names contain one themselves.
    """

    provider: str
    model: str

    @classmethod
    def parse(cls, text: str) -> "ModelSpec":
        provider, _, model = text.strip().partition(":")
        if provider not in PROVIDERS or not model:
            known = ", ".join(PROVIDERS)
            raise ModelSpecError(
                f'Write models as "provider:model", with provider one of: {known}.'
            )
        return cls(provider, model)

    def __str__(self) -> str:
        return f"{self.provider}:{self.model}"


@dataclass(frozen=True)
class Provider:
    name: str  # LangChain's name for it, used by init_chat_model
    label: str
    key_setting: str | None  # the Settings field holding its API key; None = no key needed


PROVIDERS: dict[str, Provider] = {
    "anthropic": Provider("anthropic", "Claude (Anthropic)", "anthropic_api_key"),
    "openai": Provider("openai", "OpenAI", "openai_api_key"),
    "google_genai": Provider("google_genai", "Gemini (Google)", "google_api_key"),
    "ollama": Provider("ollama", "Ollama (local)", None),
}


def api_key(settings: Settings, provider: str) -> str | None:
    setting = PROVIDERS[provider].key_setting
    if setting is None:
        return None
    secret = getattr(settings, setting)
    return secret.get_secret_value() if secret else None


def is_configured(settings: Settings, provider: str) -> bool:
    """A cloud provider needs its key; Ollama only needs to be reachable (checked when listing)."""
    return PROVIDERS[provider].key_setting is None or api_key(settings, provider) is not None


def list_models(settings: Settings, provider: str, client: httpx.Client) -> list[str]:
    """The chat models the provider offers right now, read from its own API."""
    key = api_key(settings, provider)
    if provider == "anthropic":
        response = client.get(
            "https://api.anthropic.com/v1/models",
            headers={"x-api-key": key or "", "anthropic-version": "2023-06-01"},
            params={"limit": 100},
            timeout=_LIST_TIMEOUT,
        )
        response.raise_for_status()
        return sorted(m["id"] for m in response.json()["data"])
    if provider == "openai":
        response = client.get(
            "https://api.openai.com/v1/models",
            headers={"Authorization": f"Bearer {key}"},
            timeout=_LIST_TIMEOUT,
        )
        response.raise_for_status()
        # The list also holds embedding, image and audio models; keep the chat ones.
        ids = (m["id"] for m in response.json()["data"])
        return sorted(i for i in ids if i.startswith(("gpt-", "o")) and "audio" not in i)
    if provider == "google_genai":
        response = client.get(
            "https://generativelanguage.googleapis.com/v1beta/models",
            headers={"x-goog-api-key": key or ""},
            params={"pageSize": 1000},
            timeout=_LIST_TIMEOUT,
        )
        response.raise_for_status()
        return sorted(
            m["name"].removeprefix("models/")
            for m in response.json().get("models", [])
            if "generateContent" in m.get("supportedGenerationMethods", [])
        )
    if provider == "ollama":
        response = client.get(f"{settings.ollama_base_url}/api/tags", timeout=_LIST_TIMEOUT)
        response.raise_for_status()
        return sorted(m["name"] for m in response.json().get("models", []))
    raise ModelSpecError(f"Unknown provider {provider}.")
