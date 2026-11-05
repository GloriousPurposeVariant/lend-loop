// Runs a local model with one command: starts Ollama, downloads the model, checks it can
// call tools, and makes it the agent's model for both roles.
//
//   npm run agent:local-model                 the recommended small model (granite4:3b)
//   npm run agent:local-model -- llama3.2:3b  any model from https://ollama.com/library
//
// Runs on the CPU without a GPU: expect a few seconds per answer from a 3B model.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const DEFAULT_MODEL = "granite4:3b";
const model = process.argv[2] ?? DEFAULT_MODEL;
const compose = ["compose", "-f", "docker-compose.yml", "-f", "docker-compose.agent.yml"];

function step(title, args) {
  console.log(`\n> ${title}`);
  const result = spawnSync("docker", [...compose, ...args], { stdio: "inherit" });
  if (result.status !== 0) {
    console.error(`\nStopped: "${title}" failed.`);
    process.exit(result.status ?? 1);
  }
}

/**
 * Adds the local-llm profile to COMPOSE_PROFILES in /.env. Docker Compose reads that
 * variable itself, so from now on `npm run agent:up` and `agent:down` include Ollama.
 */
function rememberLocalModelProfile() {
  const env = existsSync(".env") ? readFileSync(".env", "utf8") : "";
  const line = /^COMPOSE_PROFILES=(.*)$/m.exec(env);
  const profiles = line
    ? line[1]
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean)
    : [];
  if (profiles.includes("local-llm")) {
    return;
  }
  const value = `COMPOSE_PROFILES=${[...profiles, "local-llm"].join(",")}`;
  const comment = "# Start Ollama with the agent (added by npm run agent:local-model).";
  const updated = line ? env.replace(line[0], value) : `${env.trimEnd()}\n\n${comment}\n${value}\n`;
  writeFileSync(".env", updated);
  console.log("Added COMPOSE_PROFILES=local-llm to .env: agent:up now starts Ollama too.");
}

rememberLocalModelProfile();
step("Start Ollama and the agent", [
  "--profile",
  "local-llm",
  "up",
  "-d",
  "--build",
  "--wait",
  "ollama",
  "agent-api",
]);
step(`Download ${model} (once; a 3B model is about 2 GB)`, [
  "exec",
  "ollama",
  "ollama",
  "pull",
  model,
]);
step(`Check ${model} can call tools, and use it`, [
  "exec",
  "agent-api",
  "lendloop-agent",
  "models",
  "use",
  `ollama:${model}`,
]);
step("Use it for the fast role too", [
  "exec",
  "agent-api",
  "lendloop-agent",
  "models",
  "use",
  `ollama:${model}`,
  "--role",
  "fast",
  "--skip-check",
]);
console.log(`\nDone: the agent now uses ollama:${model}.`);
