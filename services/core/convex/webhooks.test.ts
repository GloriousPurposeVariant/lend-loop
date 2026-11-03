import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, verify } from "./lib/signing";
import schema from "./schema";
import { alice, bob, modules, seedCategory, type TestConvex } from "./test.setup";
import { EVENT_ID_HEADER } from "./webhooks";

const N8N_URL = "https://n8n.test/webhook/lendloop";
const SECRET = "outbound-secret";

beforeEach(() => {
  // Fake timers drive the scheduler, so retries minutes apart run instantly.
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-02T12:00:00Z"));
  vi.stubEnv("N8N_WEBHOOK_URL", N8N_URL);
  vi.stubEnv("N8N_OUTBOUND_SECRET", SECRET);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/** Replaces fetch with one that answers each call with the next status, then 200. */
function stubN8n(...statuses: number[]) {
  const calls: { url: string; init: RequestInit; at: number }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init, at: Date.now() });
      return new Response(null, { status: statuses.shift() ?? 200 });
    }),
  );
  return calls;
}

/** Alice lists a drill and Bob asks to borrow it, which emits loan.requested. */
async function bobRequestsDrill(
  t: TestConvex,
  range = { startDate: "2026-11-10", endDate: "2026-11-12" },
) {
  const categoryId = await seedCategory(t);
  await t.withIdentity(alice).mutation(api.users.ensureCurrent, {});
  await t.withIdentity(bob).mutation(api.users.ensureCurrent, {});
  const toolId = await t.withIdentity(alice).mutation(api.tools.create, {
    name: "Cordless drill",
    categoryId,
    condition: "good",
    description: "",
  });
  const loanId = await t.withIdentity(bob).mutation(api.loans.request, { toolId, ...range });
  return { toolId, loanId };
}

function allEvents(t: TestConvex) {
  return t.run((ctx) => ctx.db.query("outboundEvents").collect());
}

describe("deliver", () => {
  test("sends a signed loan.requested event to n8n", async () => {
    const t = convexTest(schema, modules);
    const calls = stubN8n();
    const { loanId } = await bobRequestsDrill(t);
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(calls).toHaveLength(1);
    const { url, init } = calls[0];
    const headers = init.headers as Record<string, string>;
    const body = JSON.parse(init.body as string);
    expect(url).toBe(N8N_URL);
    expect(body).toMatchObject({
      type: "loan.requested",
      loanId,
      data: {
        toolName: "Cordless drill",
        lender: { name: "Alice", email: alice.email },
        borrower: { name: "Bob", email: bob.email },
      },
    });
    expect(headers[EVENT_ID_HEADER]).toBe(body.id);
    const signature = await verify({
      secret: SECRET,
      timestamp: headers[TIMESTAMP_HEADER],
      signature: headers[SIGNATURE_HEADER],
      body: init.body as string,
      nowMs: Date.now(),
    });
    expect(signature).toBe("ok");
    expect(await allEvents(t)).toMatchObject([{ status: "delivered", attempts: 1 }]);
  });

  test("retries with growing delays and recovers when n8n is back", async () => {
    const t = convexTest(schema, modules);
    const calls = stubN8n(503, 500);
    await bobRequestsDrill(t);
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(calls.map((call) => (call.at - calls[0].at) / 1000)).toEqual([0, 30, 90]);
    // Every attempt carries the same event id, so n8n can spot a retry.
    const ids = calls.map((call) => (call.init.headers as Record<string, string>)[EVENT_ID_HEADER]);
    expect(new Set(ids).size).toBe(1);
    expect(await allEvents(t)).toMatchObject([{ status: "delivered", attempts: 3 }]);
  });

  test("gives up after 6 attempts and keeps the last error", async () => {
    const t = convexTest(schema, modules);
    const calls = stubN8n(500, 500, 500, 500, 500, 500, 500);
    await bobRequestsDrill(t);
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(calls).toHaveLength(6);
    expect(await allEvents(t)).toMatchObject([
      { status: "failed", attempts: 6, lastError: "n8n answered HTTP 500" },
    ]);
  });

  test("skips delivery when n8n is not configured", async () => {
    vi.stubEnv("N8N_WEBHOOK_URL", "");
    const t = convexTest(schema, modules);
    const calls = stubN8n();
    await bobRequestsDrill(t);
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(calls).toHaveLength(0);
    expect(await allEvents(t)).toMatchObject([{ status: "skipped" }]);
  });
});

describe("events", () => {
  test("approving a request also reports the overlapping requests it declined", async () => {
    const t = convexTest(schema, modules);
    stubN8n();
    const { toolId, loanId } = await bobRequestsDrill(t);
    const carol = { ...bob, subject: "user_carol", email: "carol@example.com", name: "Carol" };
    await t.withIdentity(carol).mutation(api.users.ensureCurrent, {});
    await t
      .withIdentity(carol)
      .mutation(api.loans.request, { toolId, startDate: "2026-11-11", endDate: "2026-11-13" });
    await t.withIdentity(alice).mutation(api.loans.approve, { loanId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const events = await allEvents(t);
    expect(events.map((event) => [event.type, event.data.borrower.name])).toEqual([
      ["loan.requested", "Bob"],
      ["loan.requested", "Carol"],
      ["loan.approved", "Bob"],
      ["loan.declined", "Carol"],
    ]);
    expect(events[3].data.declineReason).toBe("conflict");
  });
});
