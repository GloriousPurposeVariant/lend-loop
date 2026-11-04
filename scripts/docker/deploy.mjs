// The convex-deploy job: sets the deployment's environment from /.env, deploys the
// functions and loads the default categories. Safe to run again on every start.
import { execFileSync } from "node:child_process";
import { convexCliEnv } from "./convex-env.mjs";

const env = convexCliEnv();
const convex = (...args) =>
  execFileSync("npx", ["convex", ...args], { cwd: "services/core", env, stdio: "inherit" });

const deploymentEnv = {
  CLERK_JWT_ISSUER_DOMAIN: process.env.CLERK_JWT_ISSUER_DOMAIN,
  // Anything but "true" switches the sample-data commands off.
  LENDLOOP_ALLOW_SEED: process.env.LENDLOOP_ALLOW_SEED || "false",
  N8N_WEBHOOK_URL: "http://n8n:5678/webhook/lendloop-events",
  N8N_OUTBOUND_SECRET: process.env.N8N_OUTBOUND_SECRET,
  N8N_INBOUND_SECRET: process.env.N8N_INBOUND_SECRET,
};
for (const [name, value] of Object.entries(deploymentEnv)) {
  if (value) {
    convex("env", "set", name, value);
  }
}
convex("deploy", "--yes");
convex("run", "categories:seed");
