import os
import time
from collections.abc import Callable
from typing import Any

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa

from lendloop_agent.auth import ClerkTokenVerifier
from lendloop_agent.config import Settings

ISSUER = "https://clerk.test.example"
AUDIENCE = "convex"

# A key pair standing in for Clerk's: tests sign tokens with the private half, the
# verifier checks them with the public half, exactly as with real Clerk keys.
_private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
_other_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)


class _FakeSigningKey:
    def __init__(self, key: Any):
        self.key = key


class FakeJwksClient:
    """Plays the JWKS endpoint: hands out our public key, with no network."""

    def get_signing_key_from_jwt(self, token: str) -> _FakeSigningKey:
        return _FakeSigningKey(_private_key.public_key())


def make_token(*, key: Any = _private_key, algorithm: str = "RS256", **overrides: Any) -> str:
    now = int(time.time())
    claims: dict[str, Any] = {
        "iss": ISSUER,
        "sub": "user_priya",
        "aud": AUDIENCE,
        "iat": now,
        "exp": now + 60,
        "name": "Priya Shah",
    }
    claims.update(overrides)
    claims = {k: v for k, v in claims.items() if v is not None}
    return jwt.encode(claims, key, algorithm=algorithm)


@pytest.fixture
def token_factory() -> Callable[..., str]:
    return make_token


@pytest.fixture
def other_key() -> Any:
    return _other_key


@pytest.fixture
def verifier() -> ClerkTokenVerifier:
    return ClerkTokenVerifier(ISSUER, AUDIENCE, jwks_client=FakeJwksClient())


@pytest.fixture
def database_url() -> str:
    url = os.environ.get("AGENT_TEST_DATABASE_URL")
    if not url:
        pytest.skip("AGENT_TEST_DATABASE_URL is not set (run `npm run agent:check`).")
    return url


@pytest.fixture
def settings(database_url: str) -> Settings:
    return Settings(database_url=database_url, jwt_issuer=ISSUER, log_level="WARNING")
