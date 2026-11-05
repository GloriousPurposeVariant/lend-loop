from fastapi.testclient import TestClient

from lendloop_agent.api.app import create_app


def _client(settings, verifier) -> TestClient:
    return TestClient(create_app(settings, verifier))


def test_health_is_public_and_checks_the_database(settings, verifier) -> None:
    with _client(settings, verifier) as client:
        response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}


def test_signed_out_callers_are_refused(settings, verifier) -> None:
    with _client(settings, verifier) as client:
        response = client.get("/v1/me")
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_invalid_tokens_are_refused(settings, verifier, token_factory) -> None:
    with _client(settings, verifier) as client:
        response = client.get(
            "/v1/me", headers={"Authorization": f"Bearer {token_factory(aud='other')}"}
        )
    assert response.status_code == 401


def test_signed_in_member_is_recognised(settings, verifier, token_factory) -> None:
    with _client(settings, verifier) as client:
        response = client.get("/v1/me", headers={"Authorization": f"Bearer {token_factory()}"})
    assert response.status_code == 200
    assert response.json() == {"subject": "user_priya", "name": "Priya Shah"}
