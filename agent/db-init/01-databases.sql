-- Runs once, when agent-db starts with an empty volume.
-- phoenix: Phoenix's own tables (traces). agent_test: a throwaway database for tests.
CREATE DATABASE phoenix;
CREATE DATABASE agent_test;
