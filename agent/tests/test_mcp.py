import json
from collections.abc import AsyncIterator, Iterator
from contextlib import asynccontextmanager, contextmanager
from typing import Any

import httpx
import jsonschema
import pytest
from mcp.server.mcpserver import MCPServer
from starlette.testclient import TestClient

from lendloop_agent.auth import ClerkTokenVerifier
from lendloop_agent.config import Settings
from lendloop_agent.convex import ConvexClient
from lendloop_agent.mcp_server.server import create_server, http_app
from lendloop_agent.mcp_server.tools import MAX_DESCRIPTION, ToolDeps

from .conftest import ISSUER, make_token

_SETTINGS = Settings(database_url="postgresql://unused", jwt_issuer=ISSUER)
_HEADERS = {"Accept": "application/json, text/event-stream", "Host": "agent-mcp:8001"}


class FakeAuditLog:
    def __init__(self) -> None:
        self.rows: list[tuple[str, str, dict[str, Any]]] = []

    async def record(self, actor: str, action: str, details: dict[str, Any]) -> None:
        self.rows.append((actor, action, details))


class FakeConvex:
    """Plays Convex's HTTP API: answers each query path with a canned response."""

    def __init__(self, answers: dict[str, httpx.Response]):
        self.answers = answers
        self.requests: list[dict[str, Any]] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        self.requests.append({**body, "authorization": request.headers["Authorization"]})
        return self.answers[body["path"]]


class Mcp:
    """agent-mcp with a fake Convex and an in-memory audit log, called over HTTP."""

    def __init__(self, client: TestClient, convex: FakeConvex, audit: FakeAuditLog):
        self.client = client
        self.convex = convex
        self.audit = audit
        self.token = make_token()  # the signed-in member, Priya

    def rpc(self, method: str, params: dict[str, Any], token: str | None = None):
        headers = {**_HEADERS, "Authorization": f"Bearer {token or self.token}"}
        body = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
        return self.client.post("/mcp", json=body, headers=headers)

    def call(self, tool: str, arguments: dict[str, Any] | None = None) -> dict[str, Any]:
        response = self.rpc("tools/call", {"name": tool, "arguments": arguments or {}})
        assert response.status_code == 200, response.text
        result = response.json()["result"]
        if not result.get("isError"):
            # What MCP clients such as Inspector do: check the result against the
            # output schema the tool publishes.
            jsonschema.validate(result["structuredContent"], self.output_schema(tool))
        return result

    def output_schema(self, tool: str) -> dict[str, Any]:
        tools = self.rpc("tools/list", {}).json()["result"]["tools"]
        return next(t["outputSchema"] for t in tools if t["name"] == tool)


@contextmanager
def running(
    verifier: ClerkTokenVerifier,
    answers: dict[str, httpx.Response] | None = None,
    settings: Settings = _SETTINGS,
) -> Iterator[Mcp]:
    convex = FakeConvex(answers or {})
    audit = FakeAuditLog()

    @asynccontextmanager
    async def lifespan(_: MCPServer[ToolDeps]) -> AsyncIterator[ToolDeps]:
        async with httpx.AsyncClient(transport=httpx.MockTransport(convex)) as http:
            yield ToolDeps(ConvexClient("http://convex.test", http), audit)

    # JSON responses instead of a server-sent event stream: easier to assert on.
    app = http_app(create_server(settings, verifier, lifespan), settings, json_response=True)
    with TestClient(app, base_url="http://agent-mcp:8001") as client:
        yield Mcp(client, convex, audit)


def _success(value: Any) -> httpx.Response:
    return httpx.Response(200, json={"status": "success", "value": value})


def _app_error(code: str, message: str) -> httpx.Response:
    return httpx.Response(
        200,
        json={
            "status": "error",
            "errorMessage": "Uncaught ConvexError at handler (../convex/loans.ts:60)",
            "errorData": {"code": code, "message": message},
        },
    )


def _loan(status: str, tool: str) -> dict[str, Any]:
    return {
        "_id": f"loan_{tool}",
        "_creationTime": 1_793_620_800_000,  # 2026-11-02 12:00 UTC
        "toolName": tool,
        "lenderName": "Alice",
        "borrowerName": "Priya Shah",
        "startDate": "2026-11-10",
        "endDate": "2026-11-12",
        "status": status,
    }


_LISTING = {
    "_id": "tool_1",
    "_creationTime": 1_793_620_800_000,
    "name": "Cordless drill",
    "categoryId": "cat_1",
    "categoryLabel": "Power tools",
    "condition": "good",
    "description": "18V, two batteries.",
    "ownerName": "Alice",
    "ownerIsTrustedLender": True,
    "isMine": False,
    "availability": "available",
    "upcomingBookings": [],
    "images": [],
}

# A realistic Convex answer for every tool, as the real queries return them.
_ANSWERS = {
    "categories:listActive": _success(
        [{"_id": "cat_1", "slug": "power-tools", "label": "Power tools", "isActive": True}]
    ),
    "tools:browse": _success({"page": [_LISTING], "isDone": True, "continueCursor": "x"}),
    "loans:checkAvailability": _success({"available": True, "bookedRanges": []}),
    "loans:listMyRequests": _success([_loan("approved", "drill")]),
    "loans:listIncoming": _success([_loan("pending", "saw")]),
    "tools:listMine": _success([_LISTING]),
    "activity:listMine": _success(
        {
            "page": [
                {
                    "_id": "act_1",
                    "_creationTime": 1_793_620_800_000,
                    "kind": "loan.approved",
                    "role": "borrower",
                    "otherName": "Alice",
                    "toolName": "Cordless drill",
                    "startDate": "2026-11-10",
                    "endDate": "2026-11-12",
                }
            ],
            "isDone": True,
            "continueCursor": "x",
        }
    ),
}


@pytest.mark.parametrize(
    ("tool", "arguments"),
    [
        ("whoami", {}),
        ("list_categories", {}),
        ("search_tools", {"query": "drill"}),
        (
            "check_availability",
            {"tool_id": "t", "start_date": "2026-11-10", "end_date": "2026-11-12"},
        ),
        ("my_requests", {}),
        ("incoming_requests", {}),
        ("my_listings", {}),
        ("my_activity", {}),
    ],
)
def test_every_result_matches_the_schema_the_tool_publishes(
    verifier, tool: str, arguments: dict[str, Any]
) -> None:
    with running(verifier, _ANSWERS) as mcp:
        result = mcp.call(tool, arguments)  # call() validates against the output schema
    assert result.get("isError") is not True


class TestTransport:
    def test_requests_without_a_valid_token_are_refused(self, verifier) -> None:
        with running(verifier) as mcp:
            no_token = mcp.client.post("/mcp", json={}, headers=_HEADERS)
            bad_token = mcp.rpc("tools/list", {}, token=make_token(aud="other"))
        assert no_token.status_code == 401
        assert bad_token.status_code == 401

    def test_requests_for_other_hosts_are_refused(self, verifier) -> None:
        with running(verifier) as mcp:
            response = mcp.client.post(
                "/mcp",
                json={},
                headers={
                    **_HEADERS,
                    "Host": "evil.example",
                    "Authorization": f"Bearer {mcp.token}",
                },
            )
        assert response.status_code == 421

    def test_allowed_hosts_come_from_configuration(self, verifier) -> None:
        settings = _SETTINGS.model_copy(update={"mcp_allowed_hosts": ["mcp.example.com"]})
        with running(verifier, settings=settings) as mcp:
            body = {"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}}
            headers = {**_HEADERS, "Authorization": f"Bearer {mcp.token}"}
            allowed = mcp.client.post(
                "/mcp", json=body, headers={**headers, "Host": "mcp.example.com"}
            )
            default = mcp.client.post("/mcp", json=body, headers=headers)
        assert allowed.status_code == 200
        assert default.status_code == 421  # agent-mcp:8001 is no longer in the list

    def test_health_is_public(self, verifier) -> None:
        with running(verifier) as mcp:
            response = mcp.client.get("/health", headers={"Host": "agent-mcp:8001"})
        assert response.status_code == 200

    def test_stateless_any_request_works_without_a_session(self, verifier) -> None:
        with running(verifier) as mcp:
            result = mcp.call("whoami")
        assert result["structuredContent"] == {"subject": "user_priya", "name": "Priya Shah"}


class TestTools:
    def test_every_tool_is_listed_as_read_only(self, verifier) -> None:
        with running(verifier) as mcp:
            response = mcp.rpc("tools/list", {})
        tools = {tool["name"]: tool for tool in response.json()["result"]["tools"]}
        assert set(tools) == {
            "whoami",
            "list_categories",
            "search_tools",
            "check_availability",
            "my_requests",
            "incoming_requests",
            "my_listings",
            "my_activity",
        }
        for name, tool in tools.items():
            assert tool["description"], name
            if name != "whoami":
                assert tool["annotations"]["readOnlyHint"] is True, name

    def test_search_runs_as_the_member_and_returns_short_listings(self, verifier) -> None:
        listing = {
            "_id": "tool_1",
            "name": "Cordless drill",
            "categoryLabel": "Power tools",
            "condition": "good",
            "description": "x" * 1000,
            "ownerName": "Alice",
            "ownerIsTrustedLender": True,
            "isMine": False,
            "availability": "onLoan",
            "availableFrom": "2026-11-13",
            "upcomingBookings": [{"startDate": "2026-11-20", "endDate": "2026-11-21"}],
            "images": [{"url": "http://convex/img.png"}],
        }
        answers = {"tools:browse": _success({"page": [listing], "isDone": False})}
        with running(verifier, answers) as mcp:
            result = mcp.call("search_tools", {"query": "drill", "limit": 5})

        [request] = mcp.convex.requests
        # The member's own token, so Convex applies the member's own permissions.
        assert request["authorization"] == f"Bearer {mcp.token}"
        assert request["args"] == {
            "search": "drill",
            "paginationOpts": {"numItems": 5, "cursor": None},
        }
        content = result["structuredContent"]
        assert content["has_more"] is True
        [tool] = content["tools"]
        assert tool["id"] == "tool_1"
        assert tool["category"] == "Power tools"
        assert len(tool["description"]) == MAX_DESCRIPTION + 3
        assert "images" not in tool
        assert tool["upcoming_bookings"] == [{"start_date": "2026-11-20", "end_date": "2026-11-21"}]

    def test_every_call_is_audited_with_the_member_and_outcome(self, verifier) -> None:
        answers = {"loans:listMyRequests": _success([])}
        with running(verifier, answers) as mcp:
            mcp.call("my_requests")
        [(actor, action, details)] = mcp.audit.rows
        assert (actor, action) == ("user:user_priya", "tool.call")
        assert details["tool"] == "my_requests"
        assert details["outcome"] == "ok"

    def test_lists_filter_by_status_and_respect_the_limit(self, verifier) -> None:
        loans = [_loan("pending", "drill"), _loan("approved", "saw"), _loan("pending", "ladder")]
        answers = {"loans:listIncoming": _success(loans)}
        with running(verifier, answers) as mcp:
            result = mcp.call("incoming_requests", {"status": "pending", "limit": 1})
        [loan] = result["structuredContent"]["requests"]
        assert (loan["tool_name"], loan["status"]) == ("drill", "pending")
        assert loan["requested_at"].startswith("2026-11-02T12:00:00")

    def test_check_availability_passes_the_dates_and_explains_a_no(self, verifier) -> None:
        answer = {
            "available": False,
            "reason": "This tool is already booked for some of those dates.",
            "bookedRanges": [{"startDate": "2026-11-10", "endDate": "2026-11-12"}],
        }
        answers = {"loans:checkAvailability": _success(answer)}
        args = {"tool_id": "tool_1", "start_date": "2026-11-11", "end_date": "2026-11-12"}
        with running(verifier, answers) as mcp:
            result = mcp.call("check_availability", args)
        assert mcp.convex.requests[0]["args"] == {
            "toolId": "tool_1",
            "startDate": "2026-11-11",
            "endDate": "2026-11-12",
        }
        assert result["structuredContent"]["available"] is False
        assert result["structuredContent"]["reason"].startswith("This tool is already booked")


class TestToolErrors:
    def test_lendloop_errors_reach_the_model_as_tool_errors(self, verifier) -> None:
        answers = {"loans:checkAvailability": _app_error("NOT_FOUND", "Tool not found.")}
        args = {"tool_id": "tool_9", "start_date": "2026-11-11", "end_date": "2026-11-12"}
        with running(verifier, answers) as mcp:
            result = mcp.call("check_availability", args)
        assert result["isError"] is True
        # The SDK adds "Error executing tool check_availability: " in front.
        assert result["content"][0]["text"].endswith(": Tool not found.")
        assert mcp.audit.rows[0][2]["outcome"] == "rejected"

    def test_internal_details_are_never_shown(self, verifier) -> None:
        internal = httpx.Response(
            200,
            json={"status": "error", "errorMessage": 'Validator: v.id("tools") at loans.ts:12'},
        )
        args = {"tool_id": "not-an-id", "start_date": "2026-11-11", "end_date": "2026-11-12"}
        with running(verifier, {"loans:checkAvailability": internal}) as mcp:
            result = mcp.call("check_availability", args)
        assert result["isError"] is True
        assert "Validator" not in result["content"][0]["text"]
        assert "loans.ts" not in json.dumps(result)

    def test_bad_arguments_are_refused_before_convex_is_called(self, verifier) -> None:
        with running(verifier) as mcp:
            result = mcp.call("search_tools", {"limit": 500})
        assert result["isError"] is True
        assert mcp.convex.requests == []
