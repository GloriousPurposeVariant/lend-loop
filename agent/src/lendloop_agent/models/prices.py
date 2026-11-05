from decimal import Decimal
from functools import lru_cache
from pathlib import Path

import yaml
from pydantic import BaseModel

_PRICES_FILE = Path(__file__).with_name("prices.yaml")
_PER = Decimal(1_000_000)


class Price(BaseModel):
    """US dollars per 1 million tokens."""

    input: Decimal
    output: Decimal
    badge: str | None = None

    def cost(self, input_tokens: int, output_tokens: int) -> Decimal:
        return (self.input * input_tokens + self.output * output_tokens) / _PER


@lru_cache
def _table() -> dict[str, dict[str, Price]]:
    raw = yaml.safe_load(_PRICES_FILE.read_text(encoding="utf-8"))
    return {
        provider: {
            name: Price.model_validate(entry)
            for name, entry in models.items()
            if not name.startswith("_")  # _source and _as_of are notes, not models
        }
        for provider, models in raw.items()
    }


def price_for(provider: str, model: str) -> Price | None:
    """The listed price, the provider-wide "*" price (local models), or None."""
    models = _table().get(provider, {})
    return models.get(model) or models.get("*")
