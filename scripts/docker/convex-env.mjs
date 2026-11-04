import { readFileSync } from "node:fs";

// Where the convex-admin-key job writes the key, on a volume shared with the jobs below.
export const ADMIN_KEY_FILE = "/run/lendloop/convex-admin-key";

/** The environment for the Convex CLI, pointed at the backend in this Compose network. */
export function convexCliEnv() {
  return {
    ...process.env,
    CONVEX_SELF_HOSTED_URL: "http://convex-backend:3210",
    CONVEX_SELF_HOSTED_ADMIN_KEY: readFileSync(ADMIN_KEY_FILE, "utf8").trim(),
  };
}
