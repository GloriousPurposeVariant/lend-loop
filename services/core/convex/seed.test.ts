import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { alice, expectAppError, modules, seedCategory, type TestConvex } from "./test.setup";

afterEach(() => {
  vi.unstubAllEnvs();
});

async function countRows(t: TestConvex) {
  return await t.run(async (ctx) => ({
    users: (await ctx.db.query("users").collect()).length,
    tools: (await ctx.db.query("tools").collect()).length,
    loans: (await ctx.db.query("loans").collect()).length,
  }));
}

describe("seed", () => {
  test("refuses to run unless LENDLOOP_ALLOW_SEED is true", async () => {
    const t = convexTest(schema, modules);
    await expectAppError(t.mutation(internal.seed.run, {}), "FORBIDDEN");
    vi.stubEnv("LENDLOOP_ALLOW_SEED", "false");
    await expectAppError(t.mutation(internal.seed.clear, {}), "FORBIDDEN");
  });

  test("creates the sample set and replaces it on every run", async () => {
    vi.stubEnv("LENDLOOP_ALLOW_SEED", "true");
    const t = convexTest(schema, modules);

    const first = await t.mutation(internal.seed.run, {});
    const afterFirst = await countRows(t);
    const second = await t.mutation(internal.seed.run, {});

    expect(first).toEqual({ users: 4, tools: 10, loans: 8 });
    expect(second).toEqual(first);
    expect(await countRows(t)).toEqual(afterFirst);
  });

  test("includes real users, and clearing leaves their account and tools alone", async () => {
    vi.stubEnv("LENDLOOP_ALLOW_SEED", "true");
    const t = convexTest(schema, modules);
    const categoryId = await seedCategory(t);
    await t.withIdentity(alice).mutation(api.users.ensureCurrent, {});
    await t.withIdentity(alice).mutation(api.tools.create, {
      name: "Alice's drill",
      categoryId,
      condition: "good",
      description: "",
    });

    // 8 between seed users + 3 Alice borrows + 2 requests for Alice's drill.
    expect(await t.mutation(internal.seed.run, {})).toMatchObject({ loans: 13 });
    const mine = await t.withIdentity(alice).query(api.loans.listMyRequests, {});
    const incoming = await t.withIdentity(alice).query(api.loans.listIncoming, {});
    expect(mine.map((loan) => loan.status).sort()).toEqual(["approved", "pending", "returned"]);
    expect(incoming).toHaveLength(2);

    expect(await t.mutation(internal.seed.clear, {})).toEqual({ users: 4, tools: 10, loans: 13 });
    expect(await countRows(t)).toEqual({ users: 1, tools: 1, loans: 0 });
  });
});
