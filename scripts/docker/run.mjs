// Runs a command inside the tools container with the Convex CLI already configured:
//   docker compose -f docker-compose.full.yml run --rm tools npm run seed
import { spawnSync } from "node:child_process";
import { convexCliEnv } from "./convex-env.mjs";

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error("Usage: run.mjs <command> [args...]");
  process.exit(1);
}
const result = spawnSync(command, args, { stdio: "inherit", env: convexCliEnv() });
process.exit(result.status ?? 1);
