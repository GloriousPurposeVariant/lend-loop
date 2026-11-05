-- pgvector: vector columns and similarity search, used by RAG.
CREATE EXTENSION IF NOT EXISTS vector;

-- Who did what, and when. Insert-only: the trigger below refuses updates and
-- deletes, so the record cannot be quietly changed afterwards.
CREATE TABLE audit_log (
    id          bigserial PRIMARY KEY,
    at          timestamptz NOT NULL DEFAULT now(),
    trace_id    text,                  -- links the entry to its trace in Phoenix
    actor       text NOT NULL,         -- "<issuer>|<subject>" of the member, or "system"
    action      text NOT NULL,         -- e.g. "tool.call", "model.switch"
    details     jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX audit_log_actor_at ON audit_log (actor, at DESC);

CREATE FUNCTION audit_log_is_insert_only() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'audit_log is insert-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_insert_only
    BEFORE UPDATE OR DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION audit_log_is_insert_only();

-- TRUNCATE skips row triggers, so refuse it separately.
CREATE TRIGGER audit_log_no_truncate
    BEFORE TRUNCATE ON audit_log
    FOR EACH STATEMENT EXECUTE FUNCTION audit_log_is_insert_only();
