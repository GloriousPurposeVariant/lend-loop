import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { alice, bob, expectAppError, modules, seedCategory, type TestConvex } from "./test.setup";

const carol = { ...bob, subject: "user_carol", email: "carol@example.com", name: "Carol" };
const firstPage = { paginationOpts: { numItems: 20, cursor: null } };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-02T12:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

/** Alice lends a drill; Bob and Carol are signed up. */
async function setup(t: TestConvex) {
  const categoryId = await seedCategory(t);
  for (const identity of [alice, bob, carol]) {
    await t.withIdentity(identity).mutation(api.users.ensureCurrent, {});
  }
  const toolId = await t.withIdentity(alice).mutation(api.tools.create, {
    name: "Cordless drill",
    categoryId,
    condition: "good",
    description: "",
  });
  return { toolId };
}

async function feedOf(t: TestConvex, identity: typeof alice) {
  const result = await t.withIdentity(identity).query(api.activity.listMine, firstPage);
  return result.page.map(({ kind, role, otherName, declineReason }) => ({
    kind,
    role,
    otherName,
    ...(declineReason ? { declineReason } : {}),
  }));
}

describe("listMine", () => {
  test("shows each person their side of a loan, newest first", async () => {
    const t = convexTest(schema, modules);
    const { toolId } = await setup(t);
    const loanId = await t
      .withIdentity(bob)
      .mutation(api.loans.request, { toolId, startDate: "2026-11-10", endDate: "2026-11-12" });
    await t.withIdentity(alice).mutation(api.loans.approve, { loanId });

    expect(await feedOf(t, alice)).toEqual([
      { kind: "loan.approved", role: "lender", otherName: "Bob" },
      { kind: "loan.requested", role: "lender", otherName: "Bob" },
    ]);
    expect(await feedOf(t, bob)).toEqual([
      { kind: "loan.approved", role: "borrower", otherName: "Alice" },
      { kind: "loan.requested", role: "borrower", otherName: "Alice" },
    ]);
  });

  test("includes automatic declines, with the reason", async () => {
    const t = convexTest(schema, modules);
    const { toolId } = await setup(t);
    const loanId = await t
      .withIdentity(bob)
      .mutation(api.loans.request, { toolId, startDate: "2026-11-10", endDate: "2026-11-12" });
    await t
      .withIdentity(carol)
      .mutation(api.loans.request, { toolId, startDate: "2026-11-11", endDate: "2026-11-13" });
    await t.withIdentity(alice).mutation(api.loans.approve, { loanId });

    expect((await feedOf(t, carol))[0]).toEqual({
      kind: "loan.declined",
      role: "borrower",
      otherName: "Alice",
      declineReason: "conflict",
    });
  });

  test("is private: other members see nothing, signed-out callers are refused", async () => {
    const t = convexTest(schema, modules);
    const { toolId } = await setup(t);
    await t
      .withIdentity(bob)
      .mutation(api.loans.request, { toolId, startDate: "2026-11-10", endDate: "2026-11-12" });

    expect(await feedOf(t, carol)).toEqual([]);
    await expectAppError(t.query(api.activity.listMine, firstPage), "UNAUTHENTICATED");
  });
});
