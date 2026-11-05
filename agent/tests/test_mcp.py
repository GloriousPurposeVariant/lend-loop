from typing import Any

from starlette.testclient import TestClient

from lendloop_agent.config import Settings
from lendloop_agent.mcp_server.server import create_server, http_app

from .conftest import ISSUER

_SETTINGS = Settings(database_url="postgresql://unused", jwt_issuer=ISSUER)
_HEADERS = {"Accept": "application/json, text/event-stream", "Host": "agent-mcp:8001"}


def _client(verifier) -> TestClient:
    # JSON responses instead of a server-sent event stream: easier to assert on.
    app = http_app(create_server(_SETTINGS, verifier), json_response=True)
    return TestClient(app, base_url="http://agent-mcp:8001")


def _rpc(client: TestClient, token: str, method: str, params: dict[str, Any], session: str | None):
    headers = {**_HEADERS, "Authorization": f"Bearer {token}"}
    if session:
        headers["mcp-session-id"] = session
    body = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
    return client.post("/mcp", json=body, headers=headers)


def test_requests_without_a_valid_token_are_refused(verifier, token_factory) -> None:
    with _client(verifier) as client:
        no_token = client.post("/mcp", json={}, headers=_HEADERS)
        bad_token = _rpc(client, token_factory(aud="other"), "initialize", {}, None)
    assert no_token.status_code == 401
    assert bad_token.status_code == 401


def test_whoami_acts_as_the_signed_in_member(verifier, token_factory) -> None:
    token = token_factory()
    with _client(verifier) as client:
        init = _rpc(
            client,
            token,
            "initialize",
            {
                "protocolVersion": "2025-06-18",
                "capabilities": {},
                "clientInfo": {"name": "test", "version": "0"},
            },
            None,
        )
        assert init.status_code == 200, init.text
        session = init.headers.get("mcp-session-id")
        client.post(
            "/mcp",
            json={"jsonrpc": "2.0", "method": "notifications/initialized"},
            headers={
                **_HEADERS,
                "Authorization": f"Bearer {token}",
                "mcp-session-id": session or "",
            },
        )
        result = _rpc(client, token, "tools/call", {"name": "whoami", "arguments": {}}, session)
    assert result.status_code == 200, result.text
    structured = result.json()["result"]["structuredContent"]
    assert structured == {"subject": "user_priya", "name": "Priya Shah"}


def test_requests_for_other_hosts_are_refused(verifier, token_factory) -> None:
    with _client(verifier) as client:
        response = client.post(
            "/mcp",
            json={},
            headers={
                **_HEADERS,
                "Host": "evil.example",
                "Authorization": f"Bearer {token_factory()}",
            },
        )
    assert response.status_code == 421


def test_health_is_public(verifier) -> None:
    with _client(verifier) as client:
        response = client.get("/health", headers={"Host": "agent-mcp:8001"})
    assert response.status_code == 200
