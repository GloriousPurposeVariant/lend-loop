// /.env is the only settings file you edit. This script fills in the rest.
//
//   node scripts/env.mjs init   create /.env, or add what is missing to it; generates
//                               every secret, keeps every value already there, takes the
//                               Clerk keys from an existing apps/web/.env.local
//   node scripts/env.mjs sync   dev mode only (docker-compose.yml + npm run dev:*):
//                               writes services/core/.env.local and apps/web/.env.local
//                               from /.env and sets the Convex deployment's environment.
//                               Needs the stack running (npm run infra:up).
//
// Without Node.js on the host, run it in a container instead:
//   docker run --rm -v "${PWD}:/app" -w /app node:24-bookworm-slim node scripts/env.mjs init

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

const ROOT_ENV = ".env";
const secret = () => randomBytes(32).toString("hex");

// Every setting, in the order written to /.env. `value` is the default for a new file.
const SETTINGS = [
  { comment: "Clerk dashboard -> Configure -> API keys. The issuer is filled in for you." },
  { name: "CLERK_PUBLISHABLE_KEY", value: () => "" },
  { name: "CLERK_SECRET_KEY", value: () => "" },
  { name: "CLERK_JWT_ISSUER_DOMAIN", value: () => "" },
  { comment: "Generated: leave as they are." },
  { name: "CONVEX_INSTANCE_NAME", value: () => "lendloop-local" },
  { name: "CONVEX_INSTANCE_SECRET", value: secret },
  { name: "N8N_ENCRYPTION_KEY", value: secret },
  { name: "N8N_OUTBOUND_SECRET", value: secret },
  { name: "N8N_INBOUND_SECRET", value: secret },
  { comment: "Development only: allows the sample-data commands. Never true in production." },
  { name: "LENDLOOP_ALLOW_SEED", value: () => "true" },
];

/** Reads KEY=value lines; comments and blank lines are skipped. */
function readEnv(path) {
  const values = {};
  if (!existsSync(path)) {
    return values;
  }
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=(.*)$/.exec(line);
    if (match) {
      values[match[1]] = match[2].trim();
    }
  }
  return values;
}

/**
 * The Frontend API URL a Clerk publishable key stands for: the part after "pk_test_" or
 * "pk_live_" is that host name plus "$", base64-encoded.
 */
function issuerFromPublishableKey(key) {
  const match = /^pk_(?:test|live)_(.+)$/.exec(key ?? "");
  if (!match) {
    return "";
  }
  const host = Buffer.from(match[1], "base64").toString("utf8").replace(/\$$/, "");
  return /^[a-z0-9.-]+$/i.test(host) ? `https://${host}` : "";
}

function writeEnv(path, header, values) {
  const lines = [`# ${header}`, ...Object.entries(values).map(([k, v]) => `${k}=${v}`), ""];
  writeFileSync(path, lines.join("\n"));
  console.log(`Wrote ${path}`);
}

function init() {
  const current = readEnv(ROOT_ENV);
  // Someone set up before /.env held everything: reuse their Clerk keys.
  const webEnv = readEnv("apps/web/.env.local");
  const imported = [];
  for (const [name, webName] of [
    ["CLERK_PUBLISHABLE_KEY", "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"],
    ["CLERK_SECRET_KEY", "CLERK_SECRET_KEY"],
  ]) {
    if (!current[name] && webEnv[webName]) {
      current[name] = webEnv[webName];
      imported.push(`${name} (from apps/web/.env.local)`);
    }
  }
  if (!current.CLERK_JWT_ISSUER_DOMAIN) {
    current.CLERK_JWT_ISSUER_DOMAIN = issuerFromPublishableKey(current.CLERK_PUBLISHABLE_KEY);
    if (current.CLERK_JWT_ISSUER_DOMAIN) {
      imported.push("CLERK_JWT_ISSUER_DOMAIN (from the publishable key)");
    }
  }
  const known = new Set(SETTINGS.map((s) => s.name).filter(Boolean));
  const lines = ["# LendLoop settings: the only file you edit. See README > Getting started.", ""];
  const added = [];
  for (const setting of SETTINGS) {
    if (setting.comment) {
      lines.push(`# ${setting.comment}`);
      continue;
    }
    const value = current[setting.name] || setting.value();
    if (!current[setting.name]) {
      added.push(setting.name);
    }
    lines.push(`${setting.name}=${value}`);
  }
  // Anything else already in the file is kept, at the end.
  const extra = Object.entries(current).filter(([name]) => !known.has(name));
  if (extra.length > 0) {
    lines.push("", "# Your own additions", ...extra.map(([k, v]) => `${k}=${v}`));
  }
  writeFileSync(ROOT_ENV, `${lines.join("\n")}\n`);
  if (imported.length > 0) {
    console.log(`Filled in ${imported.join(", ")}`);
  }
  console.log(added.length > 0 ? `Added to .env: ${added.join(", ")}` : ".env was complete.");

  const after = readEnv(ROOT_ENV);
  const missingKeys = ["CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY"].filter((name) => !after[name]);
  if (missingKeys.length > 0) {
    console.log(`Now fill in ${missingKeys.join(" and ")} in .env (Clerk dashboard -> API keys),`);
    console.log(
      "then run npm run env:init again: it fills in the issuer from the publishable key.",
    );
  } else if (!after.CLERK_JWT_ISSUER_DOMAIN) {
    console.log("Now fill in CLERK_JWT_ISSUER_DOMAIN in .env: your Clerk Frontend API URL.");
  }
}

function sync() {
  const env = readEnv(ROOT_ENV);
  const missing = SETTINGS.map((s) => s.name).filter((name) => name && !env[name]);
  if (missing.length > 0) {
    console.error(`Missing in .env: ${missing.join(", ")}.`);
    console.error("Fill them in (or run npm run env:init), then run this again.");
    console.error("Nothing was changed: your current env files still work.");
    process.exit(1);
  }

  // Same key as `npm run convex:admin-key`, read from the running backend container.
  const adminKey = execFileSync(
    "docker",
    ["compose", "exec", "-T", "convex-backend", "./generate_admin_key.sh"],
    { encoding: "utf8" },
  )
    .trim()
    .split(/\r?\n/)
    .at(-1);

  writeEnv("services/core/.env.local", "Generated by `npm run env:sync` from /.env.", {
    CONVEX_SELF_HOSTED_URL: "http://127.0.0.1:3210",
    CONVEX_SELF_HOSTED_ADMIN_KEY: adminKey,
  });
  writeEnv("apps/web/.env.local", "Generated by `npm run env:sync` from /.env.", {
    NEXT_PUBLIC_CONVEX_URL: "http://127.0.0.1:3210",
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: env.CLERK_PUBLISHABLE_KEY,
    CLERK_SECRET_KEY: env.CLERK_SECRET_KEY,
  });

  // Settings read by the Convex functions themselves live on the deployment.
  const deployment = {
    CLERK_JWT_ISSUER_DOMAIN: env.CLERK_JWT_ISSUER_DOMAIN,
    LENDLOOP_ALLOW_SEED: env.LENDLOOP_ALLOW_SEED,
    N8N_WEBHOOK_URL: "http://n8n:5678/webhook/lendloop-events",
    N8N_OUTBOUND_SECRET: env.N8N_OUTBOUND_SECRET,
    N8N_INBOUND_SECRET: env.N8N_INBOUND_SECRET,
  };
  // The Convex CLI's own script, run with Node directly: no shell, so no quoting issues.
  const require = createRequire(resolve("services/core/package.json"));
  const convexCli = join(dirname(require.resolve("convex/package.json")), "bin/main.js");
  for (const [name, value] of Object.entries(deployment)) {
    execFileSync(process.execPath, [convexCli, "env", "set", name, value], {
      cwd: "services/core",
      stdio: ["ignore", "ignore", "inherit"],
    });
    console.log(`Set ${name} on the Convex deployment`);
  }
}

const command = process.argv[2];
if (command === "init") {
  init();
} else if (command === "sync") {
  sync();
} else {
  console.error("Usage: node scripts/env.mjs init | sync");
  process.exit(1);
}
