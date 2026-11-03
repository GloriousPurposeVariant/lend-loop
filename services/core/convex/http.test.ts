import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { SIGNATURE_HEADER, sign, TIMESTAMP_HEADER } from "./lib/signing";
import schema from "./schema";
import { alice, bob, modules, seedCategory, type TestConvex } from "./test.setup";

const SECRET = "inbound-secret";
const firstPage = { paginationOpts: { numItems: 20, cursor: null } };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-02T12:00:00Z"));
  vi.stubEnv("N8N_INBOUND_SECRET", SECRET);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

/** POSTs a JSON body signed the way n8n signs it. */
async function signedPost(
  t: TestConvex,
  path: string,
  payload: unknown,
  { secret = SECRET, ageSeconds = 0 } = {},
) {
  const body = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000) - ageSeconds);
  return await t.fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [TIMESTAMP_HEADER]: timestamp,
      [SIGNATURE_HEADER]: await sign(secret, timestamp, body),
    },
    body,
  });
}

/** Bob has one overdue loan of Alice's drill (ended 30 Oct) and one still running. */
async function setup(t: TestConvex) {
  const categoryId = await seedCategory(t);
  const lenderId = await t.withIdentity(alice).mutation(api.users.ensureCurrent, {});
  const borrowerId = await t.withIdentity(bob).mutation(api.users.ensureCurrent, {});
  const toolId = await t.withIdentity(alice).mutation(api.tools.create, {
    name: "Cordless drill",
    categoryId,
    condition: "good",
    description: "",
  });
  const loan = (startDate: string, endDate: string) =>
    t.run((ctx) =>
      ctx.db.insert("loans", {
        toolId,
        lenderId,
        borrowerId,
        startDate,
        endDate,
        status: "approved",
      }),
    );
  return {
    overdue: await loan("2026-10-28", "2026-10-30"),
    current: await loan("2026-11-01", "2026-11-05"),
  };
}

async function overdueIds(t: TestConvex) {
  const response = await signedPost(t, "/n8n/overdue-loans", {});
  const { loans } = (await response.json()) as { loans: { loanId: Id<"loans"> }[] };
  return loans.map((loan) => loan.loanId);
}

describe("signature checks", () => {
  test("refuses unsigned, wrongly signed and old requests", async () => {
    const t = convexTest(schema, modules);
    const unsigned = await t.fetch("/n8n/overdue-loans", { method: "POST", body: "{}" });
    const wrongSecret = await signedPost(t, "/n8n/overdue-loans", {}, { secret: "guess" });
    const replayed = await signedPost(t, "/n8n/overdue-loans", {}, { ageSeconds: 10 * 60 });

    expect([unsigned.status, wrongSecret.status, replayed.status]).toEqual([401, 401, 401]);
    expect(await replayed.json()).toEqual({ error: "Request expired." });
  });

  test("answers 503 when the secret is not configured", async () => {
    vi.stubEnv("N8N_INBOUND_SECRET", "");
    const t = convexTest(schema, modules);
    const response = await signedPost(t, "/n8n/overdue-loans", {});
    expect(response.status).toBe(503);
  });
});

describe("/n8n/overdue-loans", () => {
  test("lists approved loans past their end date, with who to remind", async () => {
    const t = convexTest(schema, modules);
    const { overdue } = await setup(t);
    const response = await signedPost(t, "/n8n/overdue-loans", {});

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      loans: [
        {
          loanId: overdue,
          toolName: "Cordless drill",
          endDate: "2026-10-30",
          lender: { name: "Alice", email: alice.email },
          borrower: { name: "Bob", email: bob.email },
        },
      ],
    });
  });
});

describe("/n8n/events", () => {
  test("records a reminder once, and answers a repeat as a duplicate", async () => {
    const t = convexTest(schema, modules);
    const { overdue } = await setup(t);
    const event = { id: `reminder:${overdue}:2026-11-02`, type: "reminder.sent", loanId: overdue };

    const first = await signedPost(t, "/n8n/events", event);
    const repeat = await signedPost(t, "/n8n/events", event);

    expect(await first.json()).toEqual({ status: "processed" });
    expect(await repeat.json()).toEqual({ status: "duplicate" });
    // Reminded today, so not listed again until tomorrow.
    expect(await overdueIds(t)).toEqual([]);
    vi.setSystemTime(new Date("2026-11-03T12:00:00Z"));
    expect(await overdueIds(t)).toEqual([overdue]);
  });

  test("ignores unknown loans and rejects malformed events", async () => {
    const t = convexTest(schema, modules);
    await setup(t);
    const unknown = await signedPost(t, "/n8n/events", {
      id: "reminder:nope",
      type: "reminder.sent",
      loanId: "not-a-loan-id",
    });
    const noId = await signedPost(t, "/n8n/events", { type: "reminder.sent", loanId: "x" });
    const badType = await signedPost(t, "/n8n/events", { id: "1", type: "tool.stolen" });

    expect(await unknown.json()).toEqual({ status: "ignored" });
    expect([noId.status, badType.status]).toEqual([400, 400]);
  });

  test("a reminder appears in both people's activity feeds", async () => {
    const t = convexTest(schema, modules);
    const { overdue } = await setup(t);
    await signedPost(t, "/n8n/events", { id: "r1", type: "reminder.sent", loanId: overdue });

    const feeds = await Promise.all(
      [alice, bob].map((identity) =>
        t.withIdentity(identity).query(api.activity.listMine, firstPage),
      ),
    );
    expect(feeds.map((feed) => feed.page.map((entry) => [entry.kind, entry.role]))).toEqual([
      [["reminder.sent", "lender"]],
      [["reminder.sent", "borrower"]],
    ]);
  });

  test("an email report is added to the recipient's feed once", async () => {
    const t = convexTest(schema, modules);
    const { current } = await setup(t);
    const event = { id: "email:evt1", type: "email.sent", loanId: current, recipient: "borrower" };

    const first = await signedPost(t, "/n8n/events", event);
    const repeat = await signedPost(t, "/n8n/events", event);
    const badRecipient = await signedPost(t, "/n8n/events", { ...event, recipient: "everyone" });

    expect(await first.json()).toEqual({ status: "processed" });
    expect(await repeat.json()).toEqual({ status: "duplicate" });
    expect(badRecipient.status).toBe(400);
    const bobFeed = await t.withIdentity(bob).query(api.activity.listMine, firstPage);
    const aliceFeed = await t.withIdentity(alice).query(api.activity.listMine, firstPage);
    expect(bobFeed.page).toMatchObject([
      { kind: "email.sent", role: "borrower", otherName: "Alice", toolName: "Cordless drill" },
    ]);
    expect(aliceFeed.page).toEqual([]);
  });

  test("records a failed n8n run once, for admins to see", async () => {
    const t = convexTest(schema, modules);
    await setup(t);
    await t.mutation(internal.users.promoteToAdmin, { email: alice.email });
    const failure = {
      id: "error:42",
      type: "workflow.failed",
      workflowName: "LendLoop: loan event emails",
      nodeName: "Send email",
      message: "connect ECONNREFUSED",
      executionId: "42",
      executionUrl: "javascript:alert(1)",
    };

    const first = await signedPost(t, "/n8n/events", failure);
    const repeat = await signedPost(t, "/n8n/events", failure);
    const invalid = await signedPost(t, "/n8n/events", { ...failure, id: "error:43", message: 7 });

    expect(await first.json()).toEqual({ status: "processed" });
    expect(await repeat.json()).toEqual({ status: "duplicate" });
    expect(invalid.status).toBe(400);
    const failures = await t.withIdentity(alice).query(api.automations.listWorkflowFailures, {});
    expect(failures).toMatchObject([
      { workflowName: "LendLoop: loan event emails", nodeName: "Send email" },
    ]);
    // Not an http(s) address, so it is dropped rather than shown as a link.
    expect(failures[0].executionUrl).toBeUndefined();
  });
});
