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
| `ollama`    | `localhost:11434`            | Local models (optional, see below).             |

The services are defined in `docker-compose.agent.yml`, which Compose only reads when
it is named explicitly, so the existing LendLoop setup is unaffected.

## Choosing a model

The agent uses two models: **main** (answers, decides which tools to call) and **fast**
(cheap jobs such as classifying a message). Which ones is an operator decision, made on
the command line, never by members in the app.

**Free and local, one command.** Starts Ollama, downloads a small model (about 2 GB),
checks it can call tools, and uses it for both roles:

```sh
npm run agent:local-model                  # granite4:3b, the recommended small model
npm run agent:local-model -- llama3.2:3b   # or any model from ollama.com/library
```

Without a GPU, local models run on the CPU. Measured on an Intel i5-13420H with no GPU,
answering one tool-calling question:

| Model         | Size   | Time (warm) |
| ------------- | ------ | ----------- |
| `qwen3:1.7b`  | 1.4 GB | 2.1 s       |
| `llama3.2:3b` | 2.0 GB | 2.3–2.8 s   |
| `granite4:3b` | 2.1 GB | 4.4–4.8 s   |
| `qwen3:4b`    | 2.5 GB | 33–37 s     |

The first question after a model loads takes much longer (20–200 s). Small models make
more mistakes than large ones; the evals measure how many.

**A cloud provider.** Add its key to `/.env` (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY` or
`GOOGLE_API_KEY`), run `npm run agent:up`, then:

```sh
npm run agent:models -- list                                  # every model you can use, with prices
npm run agent:models -- use google_genai:gemini-2.5-flash-lite
npm run agent:models -- use anthropic:claude-haiku-5-5 --role fast
npm run agent:models -- current                               # what each role uses now
npm run agent:models -- check                                 # one test call, with its cost
```

`use` refuses a model that fails the tool-calling check, and every switch is written to
the audit log. It takes effect on the next request, with no restart.

**Costs.** Every model call is recorded in `model_usage` with its tokens, time and cost,
priced from [`prices.yaml`](src/lendloop_agent/models/prices.yaml). Local models cost $0.
A model without a listed price is recorded with tokens but no cost; add its price there.
Gemini's free tier costs nothing up to its limits, but Google may use free-tier prompts to
improve its products.

## LendLoop's tools (MCP)

`agent-mcp` gives the agent, and any MCP client, read-only tools over LendLoop:

| Tool                 | What it answers                                              |
| -------------------- | ------------------------------------------------------------ |
| `list_categories`    | The categories tools are listed under.                       |
| `search_tools`       | Tools members lend, by name and category, with availability. |
| `check_availability` | Could I borrow this tool on these dates? If not, why not.    |
| `my_requests`        | My requests to borrow, optionally only one status.           |
| `incoming_requests`  | Requests for my tools, e.g. only the pending ones.           |
| `my_listings`        | The tools I lend.                                            |
| `my_activity`        | What happened recently to my requests and loans.             |
| `whoami`             | Who the tools act for.                                       |

Each tool calls LendLoop's Convex backend with the member's own Clerk token, so it sees
exactly what that member sees in the app. Convex error messages meant for members are
passed on; anything internal is logged, never shown. Every call is written to
`audit_log` with its trace id. Tools that change data come later, behind a confirmation.

**Try them in MCP Inspector.** With `npm run agent:up` running and the app open at
<http://localhost:3000> (signed in), get a token in the browser console:

```js
await window.Clerk.session.getToken({ template: "convex" });
```

Then run `npm run agent:inspect`. In the Inspector, choose **Streamable HTTP**, URL
`http://localhost:8001/mcp`, paste the token as a **Bearer** token, and connect. Tokens
are short-lived (a minute by default): when a tool answers "Your session has expired",
get a fresh one.

Settings: `AGENT_CONVEX_URL` (default `http://convex-backend:3210`) and
`AGENT_MCP_ALLOWED_HOSTS`, a JSON list of host names agent-mcp answers to (default
`["agent-mcp:8001", "localhost:8001", "127.0.0.1:8001"]`).

## Local development

For your editor (imports, types, go-to-definition into libraries) and quick test runs.
The services themselves always run in Docker. Needs Python 3.13.

```sh
py -3.13 -m pip install uv==0.13.4   # Windows; on macOS/Linux: pip install uv==0.13.4
cd agent
py -3.13 -m uv sync --python 3.13    # creates agent/.venv from uv.lock
.venv\Scripts\python -m pytest       # database tests skip; npm run agent:check runs all
```

In VS Code, install the recommended Python and Ruff extensions, then **Python: Select
Interpreter** and choose `agent/.venv/Scripts/python.exe` (`agent/.venv/bin/python` on
macOS/Linux). Python files are then formatted with Ruff on save.
