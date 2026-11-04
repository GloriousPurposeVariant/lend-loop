// Makes a member an admin. They must have signed in once, so their account exists.
//   npm run admin:promote -- you@example.com
// Runs the Convex CLI's own script with Node directly, so the JSON argument needs no
// shell quoting (PowerShell 5.1 would strip its quotes).

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const email = process.argv[2];
if (!email?.includes("@")) {
  console.error("Usage: npm run admin:promote -- you@example.com");
  process.exit(1);
}

const require = createRequire(import.meta.url);
const convexCli = join(dirname(require.resolve("convex/package.json")), "bin/main.js");
const result = spawnSync(
  process.execPath,
  [convexCli, "run", "users:promoteToAdmin", JSON.stringify({ email })],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);
