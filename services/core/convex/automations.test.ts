import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { alice, bob, expectAppError, modules, seedCategory, type TestConvex } from "./test.setup";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-02T12:00:00Z"));
  vi.stubEnv("N8N_WEBHOOK_URL", "https://n8n.test/webhook/lendloop");
  vi.stubEnv("N8N_OUTBOUND_SECRET", "outbound-secret");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/** n8n answers every call with `status`. Returns the number of calls so far. */
function stubN8n(status: number) {
  const calls = { count: 0 };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      calls.count++;
      return new Response(null, { status });
    }),
  );
  return calls;
}

/** Alice (an admin) lends a drill, Bob requests it, and n8n is down for all 6 attempts. */
async function failedDelivery(t: TestConvex) {
  const categoryId = await seedCategory(t);
  await t.withIdentity(alice).mutation(api.users.ensureCurrent, {});
  await t.withIdentity(bob).mutation(api.users.ensureCurrent, {});
  await t.mutation(internal.users.promoteToAdmin, { email: alice.email });
  const toolId = await t.withIdentity(alice).mutation(api.tools.create, {
    name: "Cordless drill",
    categoryId,
    condition: "good",
    description: "",
  });
  stubN8n(500);
  await t
    .withIdentity(bob)
    .mutation(api.loans.request, { toolId, startDate: "2026-11-10", endDate: "2026-11-12" });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const [event] = await t.run((ctx) => ctx.db.query("outboundEvents").collect());
  return event;
}

describe("listProblemDeliveries", () => {
  test("shows admins the deliveries that gave up, and nobody else", async () => {
    const t = convexTest(schema, modules);
    await failedDelivery(t);

    const problems = await t.withIdentity(alice).query(api.automations.listProblemDeliveries, {});
    expect(problems).toMatchObject([
      {
        type: "loan.requested",
        toolName: "Cordless drill",
        status: "failed",
        attempts: 6,
        lastError: "n8n answered HTTP 500",
      },
    ]);
    await expectAppError(
      t.withIdentity(bob).query(api.automations.listProblemDeliveries, {}),
      "FORBIDDEN",
    );
  });
});

describe("retryDelivery", () => {
  test("sends a failed event again once n8n is back", async () => {
    const t = convexTest(schema, modules);
    const event = await failedDelivery(t);
    const calls = stubN8n(200);

    await t.withIdentity(alice).mutation(api.automations.retryDelivery, { eventId: event._id });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(calls.count).toBe(1);
    const after = await t.run((ctx) => ctx.db.get("outboundEvents", event._id));
    expect(after).toMatchObject({ status: "delivered", attempts: 1 });
    expect(await t.withIdentity(alice).query(api.automations.listProblemDeliveries, {})).toEqual(
      [],
    );
  });

  test("is admin only, and refuses deliveries that are not failed or skipped", async () => {
    const t = convexTest(schema, modules);
    const event = await failedDelivery(t);
    await expectAppError(
      t.withIdentity(bob).mutation(api.automations.retryDelivery, { eventId: event._id }),
      "FORBIDDEN",
    );

    stubN8n(200);
    await t.withIdentity(alice).mutation(api.automations.retryDelivery, { eventId: event._id });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await expectAppError(
      t.withIdentity(alice).mutation(api.automations.retryDelivery, { eventId: event._id }),
      "INVALID_INPUT",
    );
  });
});
