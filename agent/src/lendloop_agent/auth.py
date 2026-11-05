import asyncio
from typing import Any, Protocol

import jwt
from pydantic import BaseModel

# Clerk signs its tokens with RS256. Accepting only that stops "alg: none" and
# key-confusion tricks, where a forged token names a weaker algorithm.
_ALGORITHMS = ["RS256"]
# Small allowance for clocks that differ by a few seconds.
_LEEWAY_SECONDS = 5


class AuthenticatedUser(BaseModel):
    """The signed-in member, taken only from a verified token."""

    subject: str
    issuer: str
    name: str | None = None
    token: str

    @property
    def token_identifier(self) -> str:
        """The same "<issuer>|<subject>" key Convex uses for this user."""
        return f"{self.issuer}|{self.subject}"


class InvalidTokenError(Exception):
    pass


class SigningKeySource(Protocol):
    """Anything that finds the public key for a token: PyJWT's JWKS client, or a test fake."""

    def get_signing_key_from_jwt(self, token: str) -> Any: ...


class ClerkTokenVerifier:
    """Checks Clerk session tokens: signature, issuer, audience and expiry.

    The public keys come from the issuer's JWKS endpoint and are cached, so most
    checks need no network call.
    """

    def __init__(self, issuer: str, audience: str, jwks_client: SigningKeySource | None = None):
        self._issuer = issuer.rstrip("/")
        self._audience = audience
        self._jwks = jwks_client or jwt.PyJWKClient(
            f"{self._issuer}/.well-known/jwks.json", cache_keys=True, lifespan=3600
        )

    def verify(self, token: str) -> AuthenticatedUser:
        try:
            signing_key = self._jwks.get_signing_key_from_jwt(token)
            claims = jwt.decode(
                token,
                signing_key.key,
                algorithms=_ALGORITHMS,
                audience=self._audience,
                issuer=self._issuer,
                leeway=_LEEWAY_SECONDS,
                options={"require": ["exp", "iat", "iss", "sub", "aud"]},
            )
        except jwt.PyJWTError as error:
            raise InvalidTokenError(str(error)) from error
        return AuthenticatedUser(
            subject=claims["sub"], issuer=claims["iss"], name=claims.get("name"), token=token
        )

    async def verify_async(self, token: str) -> AuthenticatedUser:
        # Fetching the keys is blocking network I/O; keep it off the event loop.
        return await asyncio.to_thread(self.verify, token)
