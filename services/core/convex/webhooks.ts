import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { SIGNATURE_HEADER, sign, TIMESTAMP_HEADER } from "./lib/signing";
import { loanEventDataValidator, loanEventTypeValidator } from "./schema";

// Delivers outboundEvents to n8n: a signed POST per event, retried with growing
// delays. All internal, so browsers cannot call any of it.

export const EVENT_ID_HEADER = "X-LendLoop-Event-Id";
export const MAX_ATTEMPTS = 6;
const FIRST_RETRY_DELAY_MS = 30_000;
const REQUEST_TIMEOUT_MS = 10_000;

/** 30 s, 1 min, 2 min, 4 min, 8 min: each retry waits twice as long as the last. */
export function retryDelayMs(attempts: number) {
  return FIRST_RETRY_DELAY_MS * 2 ** (attempts - 1);
}

/** The event, if it still needs delivering. */
export const getPending = internalQuery({
  args: { eventId: v.id("outboundEvents") },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("outboundEvents"),
      _creationTime: v.number(),
      type: loanEventTypeValidator,
      loanId: v.id("loans"),
      data: loanEventDataValidator,
    }),
  ),
  handler: async (ctx, args) => {
    const event = await ctx.db.get("outboundEvents", args.eventId);
    if (event?.status !== "pending") {
      return null;
    }
    const { _id, _creationTime, type, loanId, data } = event;
    return { _id, _creationTime, type, loanId, data };
  },
});

export const markDelivered = internalMutation({
  args: { eventId: v.id("outboundEvents") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const event = await ctx.db.get("outboundEvents", args.eventId);
    if (event !== null) {
      await ctx.db.patch("outboundEvents", event._id, {
        status: "delivered",
        attempts: event.attempts + 1,
        deliveredAt: Date.now(),
        nextAttemptAt: undefined,
      });
    }
    return null;
  },
});

export const markSkipped = internalMutation({
  args: { eventId: v.id("outboundEvents"), reason: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch("outboundEvents", args.eventId, {
      status: "skipped",
      lastError: args.reason,
    });
    return null;
  },
});

/** Records a failed attempt, then schedules the next one or gives up. */
export const recordFailure = internalMutation({
  args: { eventId: v.id("outboundEvents"), error: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const event = await ctx.db.get("outboundEvents", args.eventId);
    if (event === null) {
      return null;
    }
    const attempts = event.attempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      await ctx.db.patch("outboundEvents", event._id, {
        status: "failed",
        attempts,
        lastError: args.error,
        nextAttemptAt: undefined,
      });
      return null;
    }
    const delay = retryDelayMs(attempts);
    await ctx.db.patch("outboundEvents", event._id, {
      attempts,
      lastError: args.error,
      nextAttemptAt: Date.now() + delay,
    });
    await ctx.scheduler.runAfter(delay, internal.webhooks.deliver, { eventId: event._id });
    return null;
  },
});

/** One delivery attempt. Actions can call the outside world; queries and mutations cannot. */
export const deliver = internalAction({
  args: { eventId: v.id("outboundEvents") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const event = await ctx.runQuery(internal.webhooks.getPending, args);
    if (event === null) {
      return null; // Already delivered or given up.
    }
    const url = process.env.N8N_WEBHOOK_URL;
    const secret = process.env.N8N_OUTBOUND_SECRET;
    if (!url || !secret) {
      await ctx.runMutation(internal.webhooks.markSkipped, {
        eventId: event._id,
        reason: "N8N_WEBHOOK_URL or N8N_OUTBOUND_SECRET is not set.",
      });
      return null;
    }

    const body = JSON.stringify({
      id: event._id,
      type: event.type,
      occurredAt: new Date(event._creationTime).toISOString(),
      loanId: event.loanId,
      data: event.data,
    });
    // A fresh timestamp per attempt; the event id stays the same, so n8n can
    // recognise a retry of something it already handled.
    const timestamp = Math.floor(Date.now() / 1000).toString();

    let error: string | null = null;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [EVENT_ID_HEADER]: event._id,
          [TIMESTAMP_HEADER]: timestamp,
          [SIGNATURE_HEADER]: await sign(secret, timestamp, body),
        },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        error = `n8n answered HTTP ${response.status}`;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }

    if (error === null) {
      await ctx.runMutation(internal.webhooks.markDelivered, { eventId: event._id });
    } else {
      await ctx.runMutation(internal.webhooks.recordFailure, { eventId: event._id, error });
    }
    return null;
  },
});
