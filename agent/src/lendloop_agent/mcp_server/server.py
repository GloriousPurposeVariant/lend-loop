from collections.abc import AsyncIterator, Callable
from contextlib import AbstractAsyncContextManager, asynccontextmanager

import httpx
from mcp.server.auth.middleware.auth_context import get_access_token
from mcp.server.auth.provider import AccessToken
from mcp.server.auth.settings import AuthSettings
from mcp.server.mcpserver import MCPServer
from mcp.server.transport_security import TransportSecuritySettings
from pydantic import AnyHttpUrl, BaseModel
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse

from lendloop_agent.audit import PostgresAuditLog
from lendloop_agent.auth import ClerkTokenVerifier, InvalidTokenError
from lendloop_agent.config import Settings, get_settings
from lendloop_agent.convex import ConvexClient
from lendloop_agent.db import create_pool
from lendloop_agent.log import configure_logging, get_logger
from lendloop_agent.mcp_server.tools import ToolDeps, register_read_tools
from lendloop_agent.telemetry import configure_tracing

SERVICE = "agent-mcp"
# Convex answers in milliseconds; a slow call is a problem worth reporting quickly.
CONVEX_TIMEOUT_SECONDS = 10

Lifespan = Callable[[MCPServer[ToolDeps]], AbstractAsyncContextManager[ToolDeps]]


class McpTokenVerifier:
    """Adapts our Clerk check to the MCP SDK: a valid token becomes an AccessToken."""

    def __init__(self, verifier: ClerkTokenVerifier):
        self._verifier = verifier

    async def verify_token(self, token: str) -> AccessToken | None:
        try:
            user = await self._verifier.verify_async(token)
        except InvalidTokenError as error:
            get_logger().info("token_rejected", reason=str(error))
            return None
        return AccessToken(
            token=token,
            client_id="lendloop-web",
            scopes=[],
            subject=user.subject,
            claims={"iss": user.issuer, "name": user.name},
        )


class WhoAmI(BaseModel):
    subject: str
    name: str | None


def default_lifespan(settings: Settings) -> Lifespan:
    """Opens what the tools need once, at startup: an HTTP client for Convex and a
    database pool for the audit log. Startup fails if agent-db is unreachable: tools
    must not run when their calls cannot be audited."""

    @asynccontextmanager
    async def lifespan(_: MCPServer[ToolDeps]) -> AsyncIterator[ToolDeps]:
        pool = create_pool(settings.database_url)
        await pool.open(wait=True, timeout=30)
        try:
            async with httpx.AsyncClient(timeout=CONVEX_TIMEOUT_SECONDS) as http:
                yield ToolDeps(ConvexClient(settings.convex_url, http), PostgresAuditLog(pool))
        finally:
            await pool.close()

    return lifespan


def create_server(
    settings: Settings | None = None,
    verifier: ClerkTokenVerifier | None = None,
    lifespan: Lifespan | None = None,
) -> MCPServer[ToolDeps]:
    """Tests pass their own verifier and lifespan (fake Convex, in-memory audit log)."""
    settings = settings or get_settings()
    server = MCPServer(
        name="lendloop",
        instructions="Tools for LendLoop, a neighbourhood tool-lending board. "
        "Every tool acts as the signed-in member and sees only what they may see.",
        token_verifier=McpTokenVerifier(
            verifier or ClerkTokenVerifier(settings.jwt_issuer, settings.jwt_audience)
        ),
        auth=AuthSettings(
            issuer_url=AnyHttpUrl(settings.jwt_issuer),
            resource_server_url=None,
            # Our verifier checks the token's audience itself.
            validate_token_resource=False,
        ),
        lifespan=lifespan or default_lifespan(settings),
    )
    register_read_tools(server)

    @server.tool(description="Who the assistant is acting for: the signed-in member.")
    def whoami() -> WhoAmI:
        token = get_access_token()
        if token is None or token.subject is None:  # Unreachable: the transport requires a token.
            raise PermissionError("Not signed in.")
        claims = token.claims or {}
        return WhoAmI(subject=token.subject, name=claims.get("name"))

    @server.custom_route("/health", methods=["GET"])
    async def health(_: Request) -> JSONResponse:
        """Public on purpose, for Docker's health check."""
        return JSONResponse({"status": "ok"})

    return server


def http_app(
    server: MCPServer[ToolDeps], settings: Settings, *, json_response: bool = False
) -> Starlette:
    """MCP over streamable HTTP at /mcp.

    Stateless: every request stands alone, with no session kept in memory, so any
    copy of agent-mcp can answer any request and it can run behind a load balancer.
    Requests naming a host not in AGENT_MCP_ALLOWED_HOSTS are refused (DNS rebinding
    protection).
    """
    return server.streamable_http_app(
        json_response=json_response,
        stateless_http=True,
        transport_security=TransportSecuritySettings(allowed_hosts=settings.mcp_allowed_hosts),
        host="0.0.0.0",
    )


def create_app() -> Starlette:
    """The ASGI app uvicorn serves."""
    settings = get_settings()
    configure_logging(settings.log_level, SERVICE)
    configure_tracing(SERVICE)
    return http_app(create_server(settings), settings)
