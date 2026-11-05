import time

import pytest

from lendloop_agent.auth import ClerkTokenVerifier, InvalidTokenError


def test_accepts_a_valid_token(verifier: ClerkTokenVerifier, token_factory) -> None:
    user = verifier.verify(token_factory())
    assert user.subject == "user_priya"
    assert user.name == "Priya Shah"
    assert user.token_identifier == "https://clerk.test.example|user_priya"


@pytest.mark.parametrize(
    "overrides",
    [
        {"aud": "someone-else"},  # issued for another service
        {"iss": "https://evil.example"},  # issued by someone else
        {"exp": int(time.time()) - 60},  # expired
        {"sub": None},  # no user in it
    ],
    ids=["wrong-audience", "wrong-issuer", "expired", "no-subject"],
)
def test_rejects_tokens_with_bad_claims(verifier, token_factory, overrides) -> None:
    with pytest.raises(InvalidTokenError):
        verifier.verify(token_factory(**overrides))


def test_rejects_a_token_signed_with_another_key(verifier, token_factory, other_key) -> None:
    with pytest.raises(InvalidTokenError):
        verifier.verify(token_factory(key=other_key))


def test_rejects_unsigned_and_symmetric_tokens(verifier, token_factory) -> None:
    # "alg: none" and HS256 tricks: only RS256 is ever accepted.
    with pytest.raises(InvalidTokenError):
        verifier.verify(token_factory(key=None, algorithm="none"))
    with pytest.raises(InvalidTokenError):
        verifier.verify(
            token_factory(key="a-shared-secret-of-at-least-32-bytes!", algorithm="HS256")
        )


def test_rejects_a_tampered_token(verifier, token_factory) -> None:
    header, payload, signature = token_factory().split(".")
    tampered = f"{header}.{payload[:-4]}AAAA.{signature}"
    with pytest.raises(InvalidTokenError):
        verifier.verify(tampered)
