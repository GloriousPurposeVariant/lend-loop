from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from pydantic import BaseModel

from lendloop_agent.auth import AuthenticatedUser, ClerkTokenVerifier, InvalidTokenError
from lendloop_agent.config import Settings, get_settings
from lendloop_agent.db import create_pool
from lendloop_agent.log import configure_logging, get_logger
from lendloop_agent.telemetry import configure_tracing

SERVICE = "agent-api"
_bearer = HTTPBearer(auto_error=False)


def create_app(
    settings: Settings | None = None, verifier: ClerkTokenVerifier | None = None
) -> FastAPI:
    """Builds the app. Tests pass their own settings and verifier; production uses the env."""
    settings = settings or get_settings()
    configure_logging(settings.log_level, SERVICE)
    tracing = configure_tracing(SERVICE)
    log = get_logger()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        pool = create_pool(settings.database_url)
        await pool.open(wait=True, timeout=30)
        app.state.pool = pool
        log.info("started", tracing=tracing)
        yield
        await pool.close()

    app = FastAPI(title="LendLoop Assistant API", version="0.1.0", lifespan=lifespan)
    app.state.verifier = verifier or ClerkTokenVerifier(settings.jwt_issuer, settings.jwt_audience)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST"],
        allow_headers=["Authorization", "Content-Type"],
    )

    @app.exception_handler(Exception)
    async def unexpected_error(_: Request, error: Exception) -> JSONResponse:
        # Logged with its trace id; the client only learns that something failed.
        log.exception("unhandled_error", error_type=type(error).__name__)
        return JSONResponse({"error": "Internal error."}, status_code=500)

    async def current_user(
        request: Request,
        credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    ) -> AuthenticatedUser:
        """Every AI endpoint depends on this: no valid Clerk token, no AI work."""
        if credentials is None:
            raise HTTPException(
                status.HTTP_401_UNAUTHORIZED,
                "Sign in to use the assistant.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        verifier: ClerkTokenVerifier = request.app.state.verifier
        try:
            return await verifier.verify_async(credentials.credentials)
        except InvalidTokenError as error:
            log.info("token_rejected", reason=str(error))
            raise HTTPException(
                status.HTTP_401_UNAUTHORIZED,
                "Your session is not valid. Sign in again.",
                headers={"WWW-Authenticate": "Bearer"},
            ) from error

    class Health(BaseModel):
        status: str
        database: str

    @app.get("/health")
    async def health(request: Request, response: Response) -> Health:
        """For Docker's health check. Public on purpose: it reveals nothing about anyone."""
        try:
            async with request.app.state.pool.connection() as conn:
                await conn.execute("SELECT 1")
        except Exception:
            # 503 makes Docker mark the container unhealthy.
            response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
            return Health(status="degraded", database="unreachable")
        return Health(status="ok", database="ok")

    class Me(BaseModel):
        subject: str
        name: str | None

    @app.get("/v1/me")
    async def me(user: Annotated[AuthenticatedUser, Depends(current_user)]) -> Me:
        """Proves the sign-in check end to end: who does the agent think you are?"""
        return Me(subject=user.subject, name=user.name)

    # One span per request, linked to whatever the request does next.
    FastAPIInstrumentor.instrument_app(app, excluded_urls="health")
    return app
