import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { alice, bob, expectAppError, modules, seedCategory, type TestConvex } from "./test.setup";

const carol = {
  subject: "user_carol",
  issuer: "https://clerk.test",
  email: "carol@example.com",
  name: "Carol",
};

// Every test runs at 2026-11-02 12:00 UTC, so "past" and "future" are fixed.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-02T12:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

const nov10to12 = { startDate: "2026-11-10", endDate: "2026-11-12" };
const nov12to14 = { startDate: "2026-11-12", endDate: "2026-11-14" };
const nov20to21 = { startDate: "2026-11-20", endDate: "2026-11-21" };

/** Alice lends a drill; Bob and Carol are signed up as borrowers. */
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

async function requestAs(
  t: TestConvex,
  identity: typeof bob,
  toolId: Id<"tools">,
  range: { startDate: string; endDate: string },
) {
  return await t.withIdentity(identity).mutation(api.loans.request, { toolId, ...range });
}

async function statusOf(t: TestConvex, loanId: Id<"loans">) {
  return (await t.run((ctx) => ctx.db.get("loans", loanId)))?.status;
}

describe("request", () => {
  test("creates a pending loan with lender and borrower taken from the server", async () => {
    const t = convexTest(schema, modules);
    const { toolId } = await setup(t);
    const loanId = await requestAs(t, bob, toolId, nov10to12);

    const loan = await t.run((ctx) => ctx.db.get("loans", loanId));
    const [lender, borrower] = await t.run((ctx) =>
      Promise.all([ctx.db.get("users", loan!.lenderId), ctx.db.get("users", loan!.borrowerId)]),
    );
    expect(loan?.status).toBe("pending");
    expect(lender?.email).toBe(alice.email);
    expect(borrower?.email).toBe(bob.email);
  });

  test("rejects borrowing your own tool", async () => {
    const t = convexTest(schema, modules);
    const { toolId } = await setup(t);
    await expectAppError(requestAs(t, alice, toolId, nov10to12), "INVALID_INPUT");
  });

  test("rejects invalid dates", async () => {
    const t = convexTest(schema, modules);
    const { toolId } = await setup(t);
    const past = { startDate: "2026-10-20", endDate: "2026-10-21" };
    const reversed = { startDate: "2026-11-12", endDate: "2026-11-10" };
    await expectAppError(requestAs(t, bob, toolId, past), "INVALID_INPUT");
    await expectAppError(requestAs(t, bob, toolId, reversed), "INVALID_INPUT");
  });

  test("rejects dates that overlap an approved loan", async () => {
    const t = convexTest(schema, modules);
    const { toolId } = await setup(t);
    const loanId = await requestAs(t, bob, toolId, nov10to12);
    await t.withIdentity(alice).mutation(api.loans.approve, { loanId });

    await expectAppError(requestAs(t, carol, toolId, nov12to14), "INVALID_INPUT");
    await requestAs(t, carol, toolId, nov20to21);
  });

  test("rejects a second pending request from the same borrower", async () => {
    const t = convexTest(schema, modules);
    const { toolId } = await setup(t);
    await requestAs(t, bob, toolId, nov10to12);
    await expectAppError(requestAs(t, bob, toolId, nov20to21), "INVALID_INPUT");
  });

  test("rejects a removed tool and signed-out callers", async () => {
    const t = convexTest(schema, modules);
    const { toolId } = await setup(t);
    await expectAppError(
      t.mutation(api.loans.request, { toolId, ...nov10to12 }),
      "UNAUTHENTICATED",
    );
    await t.withIdentity(alice).mutation(api.tools.remove, { toolId });
    await expectAppError(requestAs(t, bob, toolId, nov10to12), "NOT_FOUND");
  });
});

describe("checkAvailability", () => {
  async function check(t: TestConvex, identity: typeof bob, toolId: Id<"tools">, range: object) {
    return await t
      .withIdentity(identity)
      .query(api.loans.checkAvailability, { toolId, ...nov10to12, ...range });
  }

  test("says yes for free dates, and the request then succeeds", async () => {
    const t = convexTest(schema, modules);
    const { toolId } = await setup(t);
    expect(await check(t, bob, toolId, {})).toEqual({ available: true, bookedRanges: [] });
    await requestAs(t, bob, toolId, nov10to12);
  });

  test("says no with the same reasons request gives, and lists booked dates", async () => {
    const t = convexTest(schema, modules);
    const { toolId } = await setup(t);
    const loanId = await requestAs(t, bob, toolId, nov10to12);
    await t.withIdentity(alice).mutation(api.loans.approve, { loanId });

    const overlapping = await check(t, carol, toolId, nov12to14);
    expect(overlapping).toEqual({
      available: false,
      reason: "This tool is already booked for some of those dates.",
      bookedRanges: [nov10to12],
    });
    expect((await check(t, alice, toolId, nov20to21)).reason).toMatch(/your own tool/);
    expect((await check(t, carol, toolId, { startDate: "2026-10-01" })).reason).toMatch(
      /in the past/,
    );
    expect((await check(t, carol, toolId, nov20to21)).available).toBe(true);
  });

  test("changes nothing, and refuses removed tools and signed-out callers", async () => {
    const t = convexTest(schema, modules);
    const { toolId } = await setup(t);
    await check(t, bob, toolId, {});
    expect(await t.run((ctx) => ctx.db.query("loans").collect())).toHaveLength(0);

    await expectAppError(
      t.query(api.loans.checkAvailability, { toolId, ...nov10to12 }),
      "UNAUTHENTICATED",
    );
    await t.withIdentity(alice).mutation(api.tools.remove, { toolId });
    await expectAppError(check(t, bob, toolId, {}), "NOT_FOUND");
  });
});

describe("approve", () => {
  test("only the lender can approve, not the borrower or an admin", async () => {
    const t = convexTest(schema, modules);
    const { toolId } = await setup(t);
    const loanId = await requestAs(t, bob, toolId, nov10to12);
    await t.mutation(internal.users.promoteToAdmin, { email: carol.email });

    await expectAppError(t.withIdentity(bob).mutation(api.loans.approve, { loanId }), "FORBIDDEN");
    await expectAppError(
      t.withIdentity(carol).mutation(api.loans.approve, { loanId }),
      "FORBIDDEN",
    );
  });

  test("declines overlapping pending requests and leaves the others", async () => {
    const t = convexTest(schema, modules);
    const { toolId } = await setup(t);
    const bobLoan = await requestAs(t, bob, toolId, nov10to12);
    const carolOverlap = await requestAs(t, carol, toolId, nov12to14);

    await t.withIdentity(alice).mutation(api.loans.approve, { loanId: bobLoan });

    const declined = await t.run((ctx) => ctx.db.get("loans", carolOverlap));
    expect(await statusOf(t, bobLoan)).toBe("approved");
    expect(declined).toMatchObject({ status: "declined", declineReason: "conflict" });
  });

  test("re-checks overlap at approval time", async () => {
    const t = convexTest(schema, modules);
    const { toolId } = await setup(t);
    const loanId = await requestAs(t, bob, toolId, nov10to12);
    // Simulate a loan approved after Bob asked, e.g. by a concurrent approval.
    await t.run(async (ctx) => {
      const carolRow = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", carol.email))
        .unique();
      const tool = await ctx.db.get("tools", toolId);
      await ctx.db.insert("loans", {
        toolId,
        lenderId: tool!.ownerId,
        borrowerId: carolRow!._id,
        ...nov12to14,
        status: "approved",
      });
    });

    await expectAppError(
      t.withIdentity(alice).mutation(api.loans.approve, { loanId }),
      "INVALID_INPUT",
    );
    expect(await statusOf(t, loanId)).toBe("pending");
  });

  test("rejects a request whose dates have passed", async () => {
    const t = convexTest(schema, modules);
    const { toolId } = await setup(t);
    const loanId = await requestAs(t, bob, toolId, nov10to12);
    vi.setSystemTime(new Date("2026-11-20T12:00:00Z"));
    await expectAppError(
      t.withIdentity(alice).mutation(api.loans.approve, { loanId }),
      "INVALID_INPUT",
    );
  });
});

describe("decline, cancel and markReturned", () => {
  test("lender declines; the borrower cannot", async () => {
    const t = convexTest(schema, modules);
    const { toolId } = await setup(t);
    const loanId = await requestAs(t, bob, toolId, nov10to12);
    await expectAppError(t.withIdentity(bob).mutation(api.loans.decline, { loanId }), "FORBIDDEN");
    await t.withIdentity(alice).mutation(api.loans.decline, { loanId });
    expect(await statusOf(t, loanId)).toBe("declined");
  });

  test("borrower cancels a pending request; the lender cannot", async () => {
    const t = convexTest(schema, modules);
    const { toolId } = await setup(t);
    const loanId = await requestAs(t, bob, toolId, nov10to12);
    await expectAppError(t.withIdentity(alice).mutation(api.loans.cancel, { loanId }), "FORBIDDEN");
    await t.withIdentity(bob).mutation(api.loans.cancel, { loanId });
    expect(await statusOf(t, loanId)).toBe("cancelled");
  });

  test("only the lender marks an approved loan returned", async () => {
    const t = convexTest(schema, modules);
    const { toolId } = await setup(t);
    const loanId = await requestAs(t, bob, toolId, nov10to12);
    await expectAppError(
      t.withIdentity(alice).mutation(api.loans.markReturned, { loanId }),
      "INVALID_INPUT",
    );
    await t.withIdentity(alice).mutation(api.loans.approve, { loanId });
    await expectAppError(
      t.withIdentity(bob).mutation(api.loans.markReturned, { loanId }),
      "FORBIDDEN",
    );

    await t.withIdentity(alice).mutation(api.loans.markReturned, { loanId });
    const loan = await t.run((ctx) => ctx.db.get("loans", loanId));
    expect(loan?.status).toBe("returned");
    expect(loan?.returnedAt).toEqual(expect.any(Number));
  });

  test("removing a tool declines its pending requests", async () => {
    const t = convexTest(schema, modules);
    const { toolId } = await setup(t);
    const loanId = await requestAs(t, bob, toolId, nov10to12);
    await t.withIdentity(alice).mutation(api.tools.remove, { toolId });
    const loan = await t.run((ctx) => ctx.db.get("loans", loanId));
    expect(loan).toMatchObject({ status: "declined", declineReason: "toolRemoved" });
  });
});

describe("lists", () => {
  test("borrower and lender each see the loan, with names and no emails", async () => {
    const t = convexTest(schema, modules);
    const { toolId } = await setup(t);
    await requestAs(t, bob, toolId, nov10to12);

    const mine = await t.withIdentity(bob).query(api.loans.listMyRequests, {});
    const incoming = await t.withIdentity(alice).query(api.loans.listIncoming, {});
    const carolSees = await t.withIdentity(carol).query(api.loans.listIncoming, {});

    expect(mine).toHaveLength(1);
    expect(incoming).toHaveLength(1);
    expect(carolSees).toHaveLength(0);
    expect(mine[0]).toMatchObject({
      toolName: "Cordless drill",
      lenderName: "Alice",
      borrowerName: "Bob",
      status: "pending",
    });
    expect(JSON.stringify(mine)).not.toContain("@example.com");
  });

  test("only admins can list all loans", async () => {
    const t = convexTest(schema, modules);
    const { toolId } = await setup(t);
    await requestAs(t, bob, toolId, nov10to12);
    const firstPage = { paginationOpts: { numItems: 10, cursor: null } };

    await expectAppError(t.withIdentity(bob).query(api.loans.listAll, firstPage), "FORBIDDEN");
    await t.mutation(internal.users.promoteToAdmin, { email: carol.email });
    const all = await t.withIdentity(carol).query(api.loans.listAll, firstPage);
    expect(all.page).toHaveLength(1);
  });
});
