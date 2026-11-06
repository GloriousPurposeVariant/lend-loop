import json
from typing import Any

import httpx
import pytest

from lendloop_agent.convex import INVALID, SESSION_EXPIRED, UNAVAILABLE, ConvexClient, ConvexError


def _client(handler: Any) -> ConvexClient:
    return ConvexClient(
        "http://convex.test/", httpx.AsyncClient(transport=httpx.MockTransport(handler))
    )


async def test_sends_the_members_token_and_leaves_out_empty_arguments() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json={"status": "success", "value": [1, 2]})

    value = await _client(handler).query(
        "tools:browse", {"search": "drill", "categoryId": None}, "tok"
    )
    assert value == [1, 2]
    [request] = seen
    assert str(request.url) == "http://convex.test/api/query"
    assert request.headers["Authorization"] == "Bearer tok"
    assert json.loads(request.content) == {
        "path": "tools:browse",
        "args": {"search": "drill"},
        "format": "json",
    }


@pytest.mark.parametrize(
    ("response", "message", "kind"),
    [
        # LendLoop's own error: its message is written for members, so it is passed on.
        (
            httpx.Response(
                200,
                json={
                    "status": "error",
                    "errorMessage": "[Request ID: 1] Server Error Uncaught ConvexError: ...",
                    "errorData": {"code": "NOT_FOUND", "message": "Tool not found."},
                },
            ),
            "Tool not found.",
            "rejected",
        ),
        (
            httpx.Response(
                200,
                json={
                    "status": "error",
                    "errorData": {"code": "UNAUTHENTICATED", "message": "You must be signed in."},
                },
            ),
            "You must be signed in.",
            "auth",
        ),
        # Anything else carries internals (function names, validators): never shown.
        (
            httpx.Response(
                200,
                json={
                    "status": "error",
                    "errorMessage": "ArgumentValidationError: Value does not match validator."
                    ' Path: .toolId Value: "x" Validator: v.id("tools")',
                },
            ),
            INVALID,
            "invalid",
        ),
        (httpx.Response(401, json={"code": "InvalidAuthHeader"}), SESSION_EXPIRED, "auth"),
        (httpx.Response(502, text="Bad gateway"), UNAVAILABLE, "unavailable"),
    ],
    ids=["app-error", "signed-out", "internal-error", "bad-token", "server-down"],
)
async def test_errors_become_safe_messages(
    response: httpx.Response, message: str, kind: str
) -> None:
    with pytest.raises(ConvexError) as raised:
        await _client(lambda _: response).query("loans:listMyRequests", {}, "tok")
    assert (raised.value.message, raised.value.kind) == (message, kind)
    assert "Validator" not in raised.value.message


async def test_an_unreachable_convex_is_reported_as_unavailable() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused", request=request)

    with pytest.raises(ConvexError) as raised:
        await _client(handler).query("loans:listMyRequests", {}, "tok")
    assert raised.value.kind == "unavailable"
