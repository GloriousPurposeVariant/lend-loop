# The agent's image: one build, used by agent-migrate, agent-api and agent-mcp.
#   runtime: production dependencies only, runs as a non-root user
#   dev:     adds the test and lint tools, for `npm run agent:check`

FROM ghcr.io/astral-sh/uv:0.13.4@sha256:9f130421e930bfbdc563c00740466603f8723158e90297d07957c2294640262b AS uv

FROM python:3.13.15-slim-bookworm@sha256:2325bb286ec344af3e5898cc224b5844e2707ac6e26b1632516fd3edc84a5e26 AS base
COPY --from=uv /uv /usr/local/bin/uv
# Compiled bytecode starts faster; never let uv download its own Python.
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never \
    PYTHONUNBUFFERED=1 PATH="/app/.venv/bin:$PATH"
WORKDIR /app

FROM base AS runtime
# Dependencies first, from the lockfile only, so this layer is cached until they change.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY . .
RUN uv sync --frozen --no-dev
RUN useradd --system --uid 1001 agent
USER agent

# Checks only, never deployed: stays root so the tools can write their caches.
FROM runtime AS dev
USER root
# pyright runs on Node.js, which it downloads on first use and which needs libatomic.
# Fetching it here means `npm run agent:check` never downloads anything.
RUN apt-get update && apt-get install -y --no-install-recommends libatomic1 \
    && rm -rf /var/lib/apt/lists/*
RUN uv sync --frozen && pyright --version
