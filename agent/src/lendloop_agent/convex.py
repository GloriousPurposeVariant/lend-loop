from collections.abc import Mapping
from typing import Any, Literal

import httpx

from lendloop_agent.log import get_logger
from lendloop_agent.telemetry import get_tracer

ErrorKind = Literal["rejected", "auth", "invalid", "unavailable"]

UNAVAILABLE = "LendLoop is not reachable right now. Try again in a moment."
SESSION_EXPIRED = "Your session has expired. Sign in again."
INVALID = "LendLoop could not run that request. Check the ids and dates."


class ConvexError(Exception):
    """A Convex call failed. `message` is safe to show the member and the model:
    it is LendLoop's own message (e.g. "Tool not found.") or one of ours, never
    internals such as stack traces or function names."""

    def __init__(self, message: str, kind: ErrorKind):
        super().__init__(message)
        self.message = message
        self.kind = kind


class ConvexClient:
    """Calls LendLoop's Convex queries over Convex's HTTP API, as the member whose
    Clerk token is passed. Convex checks the token and applies its own rules, so the
    agent can only ever see what that member could see in the app."""

    def __init__(self, base_url: str, http: httpx.AsyncClient):
        self._url = f"{base_url.rstrip('/')}/api/query"
        self._http = http

    async def query(self, path: str, args: Mapping[str, Any], token: str) -> Any:
        """Runs a public query, e.g. path "loans:listMyRequests", and returns its value.

        Arguments that are None are left out: Convex treats a missing optional argument
        as absent, but rejects null.
        """
        body = {
            "path": path,
            "args": {key: value for key, value in args.items() if value is not None},
            "format": "json",
        }
        log = get_logger().bind(convex_path=path)
        with get_tracer().start_as_current_span("convex.query", attributes={"convex.path": path}):
            try:
                response = await self._http.post(
                    self._url, json=body, headers={"Authorization": f"Bearer {token}"}
                )
            except httpx.HTTPError as error:
                log.warning("convex_unreachable", error_type=type(error).__name__)
                raise ConvexError(UNAVAILABLE, "unavailable") from error
            return _result(response, log)


def _result(response: httpx.Response, log: Any) -> Any:
    if response.status_code in (401, 403):
        # Convex refused the token itself: expired, or signed for someone else.
        raise ConvexError(SESSION_EXPIRED, "auth")
    try:
        body = response.json()
    except ValueError:
        body = None
    if response.status_code != 200 or not isinstance(body, dict):
        log.warning("convex_bad_response", status=response.status_code)
        raise ConvexError(UNAVAILABLE, "unavailable")
    if body.get("status") == "success":
        return body.get("value")

    data = body.get("errorData")
    if isinstance(data, dict) and isinstance(data.get("message"), str):
        # A ConvexError thrown on purpose by LendLoop (lib/errors.ts): written for members.
        kind: ErrorKind = "auth" if data.get("code") == "UNAUTHENTICATED" else "rejected"
        raise ConvexError(data["message"], kind)
    # Anything else (bad arguments, a bug) carries internals in errorMessage: logged, not shown.
    log.warning("convex_error", detail=str(body.get("errorMessage"))[:500])
    raise ConvexError(INVALID, "invalid")
