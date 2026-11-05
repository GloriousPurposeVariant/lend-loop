from typing import Any

from langchain.chat_models import init_chat_model
from langchain_core.language_models import BaseChatModel

from lendloop_agent.config import Settings
from lendloop_agent.models.providers import ModelSpec, ModelSpecError, api_key, is_configured

# Give up on a model call after this long, and retry a failed one this many times.
REQUEST_TIMEOUT_SECONDS = 120
MAX_RETRIES = 2


def build_chat_model(settings: Settings, spec: ModelSpec) -> BaseChatModel:
    """The one place a model is created. Nothing else in the agent knows which
    provider it is talking to, so switching providers is a configuration change."""
    if not is_configured(settings, spec.provider):
        raise ModelSpecError(f"{spec.provider} has no API key. Add it to .env and restart.")
    options: dict[str, Any] = {}
    # Temperature 0: the most repeatable answers, which makes evals comparable. OpenAI's
    # reasoning models refuse any temperature but the default, so it is left out there.
    if spec.provider != "openai":
        options["temperature"] = 0
    if spec.provider == "ollama":
        options["base_url"] = settings.ollama_base_url
    else:
        options["api_key"] = api_key(settings, spec.provider)
        options["max_retries"] = MAX_RETRIES
        options["timeout"] = REQUEST_TIMEOUT_SECONDS
    return init_chat_model(spec.model, model_provider=spec.provider, **options)
