import { v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { requireAdmin } from "./lib/auth";
import { appError } from "./lib/errors";
import { deliveryStatusValidator, loanEventTypeValidator } from "./schema";

// Admin view of the n8n integration: deliveries that need attention, and failed
// n8n runs. Admins only; the rest of the app never needs these.

const LIST_LIMIT = 50;

const deliveryValidator = v.object({
  _id: v.id("outboundEvents"),
  _creationTime: v.number(),
  type: loanEventTypeValidator,
  toolName: v.string(),
  status: deliveryStatusValidator,
  attempts: v.number(),
  lastError: v.optional(v.string()),
  nextAttemptAt: v.optional(v.number()),
});

/**
 * Deliveries to n8n that did not simply succeed: given up after every retry,
 * skipped because n8n was not configured, or failing and waiting for a retry.
 */
export const listProblemDeliveries = query({
  args: {},
  returns: v.array(deliveryValidator),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const byStatus = (status: "failed" | "skipped" | "pending") =>
      ctx.db
        .query("outboundEvents")
        .withIndex("by_status", (q) => q.eq("status", status))
        .order("desc")
        .take(LIST_LIMIT);
    const [failed, skipped, pending] = await Promise.all([
      byStatus("failed"),
      byStatus("skipped"),
      byStatus("pending"),
    ]);
    // A pending event with no attempts yet is just about to be sent: not a problem.
    const retrying = pending.filter((event) => event.attempts > 0);
    return [...failed, ...retrying, ...skipped]
      .sort((a, b) => b._creationTime - a._creationTime)
      .slice(0, LIST_LIMIT)
      .map((event) => ({
        _id: event._id,
        _creationTime: event._creationTime,
        type: event.type,
        toolName: event.data.toolName,
        status: event.status,
        attempts: event.attempts,
        lastError: event.lastError,
        nextAttemptAt: event.nextAttemptAt,
      }));
  },
});

/** Failed n8n runs reported by the Error Workflow, newest first. */
export const listWorkflowFailures = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("workflowFailures"),
      _creationTime: v.number(),
      workflowName: v.string(),
      nodeName: v.optional(v.string()),
      message: v.string(),
      executionUrl: v.optional(v.string()),
    }),
  ),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const failures = await ctx.db.query("workflowFailures").order("desc").take(LIST_LIMIT);
    return failures.map(
      ({ _id, _creationTime, workflowName, nodeName, message, executionUrl }) => ({
        _id,
        _creationTime,
        workflowName,
        nodeName,
        message,
        executionUrl,
      }),
    );
  },
});

/**
 * Sends a failed or skipped event again, with a fresh set of attempts. The event
 * keeps its id, so n8n still recognises it if it was in fact handled before.
 */
export const retryDelivery = mutation({
  args: { eventId: v.id("outboundEvents") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const event = await ctx.db.get("outboundEvents", args.eventId);
    if (event === null) {
      throw appError("NOT_FOUND", "Delivery not found.");
    }
    if (event.status !== "failed" && event.status !== "skipped") {
      throw appError(
        "INVALID_INPUT",
        `This delivery is ${event.status}; only failed or skipped ones can be retried.`,
      );
    }
    await ctx.db.patch("outboundEvents", event._id, {
      status: "pending",
      attempts: 0,
      nextAttemptAt: undefined,
    });
    await ctx.scheduler.runAfter(0, internal.webhooks.deliver, { eventId: event._id });
    return null;
  },
});
