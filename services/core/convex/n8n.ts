import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { toIsoDate } from "./lib/dates";

// What n8n can ask of us, through the signed endpoints in http.ts. Internal, so
// the only way in from outside is a request that passed the signature check.

const MAX_OVERDUE = 100;

const personValidator = v.object({ name: v.string(), email: v.string() });

/** Approved loans whose end date has passed and that have had no reminder today. */
export const overdueLoans = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      loanId: v.id("loans"),
      toolName: v.string(),
      endDate: v.string(),
      lender: personValidator,
      borrower: personValidator,
    }),
  ),
  handler: async (ctx) => {
    const today = toIsoDate(Date.now());
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_status_and_end", (q) => q.eq("status", "approved").lt("endDate", today))
      .take(MAX_OVERDUE);
    const due = loans.filter((loan) => loan.lastReminderOn !== today);
    return await Promise.all(
      due.map(async (loan) => {
        const [tool, lender, borrower] = await Promise.all([
          ctx.db.get("tools", loan.toolId),
          ctx.db.get("users", loan.lenderId),
          ctx.db.get("users", loan.borrowerId),
        ]);
        return {
          loanId: loan._id,
          toolName: tool?.name ?? "Unknown tool",
          endDate: loan.endDate,
          lender: { name: lender?.displayName ?? "Unknown user", email: lender?.email ?? "" },
          borrower: { name: borrower?.displayName ?? "Unknown user", email: borrower?.email ?? "" },
        };
      }),
    );
  },
});

/**
 * n8n reports that it sent an overdue reminder. Idempotent: a repeated eventId
 * (n8n retrying after a timeout, say) is answered "duplicate" and changes nothing.
 */
export const recordReminderSent = internalMutation({
  args: { eventId: v.string(), loanId: v.string() },
  returns: v.union(v.literal("processed"), v.literal("duplicate"), v.literal("ignored")),
  handler: async (ctx, args) => {
    const seen = await ctx.db
      .query("inboundEvents")
      .withIndex("by_event_id", (q) => q.eq("eventId", args.eventId))
      .unique();
    if (seen !== null) {
      return "duplicate";
    }
    await ctx.db.insert("inboundEvents", { eventId: args.eventId, type: "reminder.sent" });

    // The id comes from outside, so check it is really a loan id first.
    const loanId = ctx.db.normalizeId("loans", args.loanId);
    const loan = loanId === null ? null : await ctx.db.get("loans", loanId);
    if (loan === null || loan.status !== "approved") {
      return "ignored";
    }
    await ctx.db.patch("loans", loan._id, { lastReminderOn: toIsoDate(Date.now()) });
    return "processed";
  },
});
