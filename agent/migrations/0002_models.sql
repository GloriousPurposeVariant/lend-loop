-- The model chosen for each role with `lendloop-agent models use`. Until a role has
-- a row here, the AGENT_MODEL / AGENT_FAST_MODEL defaults from .env apply.
--   main: answers and decides which tools to call
--   fast: cheap jobs such as classifying a message or summarising a conversation
CREATE TABLE model_selection (
    role        text PRIMARY KEY CHECK (role IN ('main', 'fast')),
    model       text NOT NULL,             -- "provider:model"
    changed_at  timestamptz NOT NULL DEFAULT now(),
    changed_by  text NOT NULL
);

-- One row per model call: tokens, cost and time. The basis of every cost report.
CREATE TABLE model_usage (
    id             bigserial PRIMARY KEY,
    at             timestamptz NOT NULL DEFAULT now(),
    trace_id       text,                   -- the call's trace in Phoenix
    actor          text NOT NULL,          -- the member, or "system:<what>"
    role           text NOT NULL,
    model          text NOT NULL,
    input_tokens   integer NOT NULL,
    output_tokens  integer NOT NULL,
    cost_usd       numeric(14, 8),         -- NULL when prices.yaml has no price for it
    latency_ms     integer NOT NULL
);
CREATE INDEX model_usage_at ON model_usage (at);
CREATE INDEX model_usage_actor_at ON model_usage (actor, at);
