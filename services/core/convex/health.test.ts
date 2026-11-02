import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

test("ping returns ok", async () => {
  const t = convexTest(schema, modules);
  expect(await t.query(api.health.ping)).toBe("ok");
});
