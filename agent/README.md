# LendLoop Assistant (agent service)

A LangGraph agent for signed-in LendLoop members, built as its own microservice:
FastAPI for the chat API, an MCP server for LendLoop's tools, its own Postgres
(with pgvector), and self-hosted tracing in Arize Phoenix. Work in progress on the
`feat/agent` branch.

## Run it

Needs `/.env` with `AGENT_DB_PASSWORD` (`npm run env:init` adds it) and `CLERK_JWT_ISSUER_DOMAIN`.

```sh
npm run agent:up      # LendLoop's stack plus agent-db, phoenix, agent-api, agent-mcp
npm run agent:check   # lint, formatting, types and tests, in Docker
npm run agent:down
```

| Service     | Address                      | What it is                                      |
| ----------- | ---------------------------- | ----------------------------------------------- |
| `agent-api` | <http://localhost:8000/docs> | Chat API (FastAPI). Signed-in members only.     |
| `agent-mcp` | <http://localhost:8001/mcp>  | MCP server with LendLoop's tools.               |
| `phoenix`   | <http://localhost:6006>      | Traces of every request, model and tool call.   |
| `agent-db`  | `localhost:5433`             | Postgres: audit log, conversations, embeddings. |

The services are defined in `docker-compose.agent.yml`, which Compose only reads when
it is named explicitly, so the existing LendLoop setup is unaffected.
