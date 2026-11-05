from mcp.server.auth.middleware.auth_context import get_access_token
from mcp.server.auth.provider import AccessToken
from mcp.server.auth.settings import AuthSettings
from mcp.server.mcpserver import MCPServer
from mcp.server.transport_security import TransportSecuritySettings
from pydantic import AnyHttpUrl, BaseModel
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse

from lendloop_agent.auth import ClerkTokenVerifier, InvalidTokenError
from lendloop_agent.config import Settings, get_settings
from lendloop_agent.log import configure_logging, get_logger
from lendloop_agent.telemetry import configure_tracing

SERVICE = "agent-mcp"
# How other containers and the host reach this server; anything else is refused.
ALLOWED_HOSTS = ["agent-mcp:8001", "localhost:8001", "127.0.0.1:8001"]


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


def create_server(
    settings: Settings | None = None, verifier: ClerkTokenVerifier | None = None
) -> MCPServer:
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
    )

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


def http_app(server: MCPServer, *, json_response: bool = False) -> Starlette:
    """MCP over streamable HTTP at /mcp. Requests naming any other host are refused
    (DNS rebinding protection)."""
    return server.streamable_http_app(
        json_response=json_response,
        transport_security=TransportSecuritySettings(allowed_hosts=ALLOWED_HOSTS),
        host="0.0.0.0",
    )


def create_app() -> Starlette:
    """The ASGI app uvicorn serves."""
    settings = get_settings()
    configure_logging(settings.log_level, SERVICE)
    configure_tracing(SERVICE)
    return http_app(create_server(settings))
