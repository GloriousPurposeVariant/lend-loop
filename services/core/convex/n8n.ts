import { v } from "convex/values";
import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { addActivity } from "./lib/activity";
import { toIsoDate } from "./lib/dates";
import { loanRoleValidator } from "./schema";

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

const reportResultValidator = v.union(
  v.literal("processed"),
  v.literal("duplicate"),
  v.literal("ignored"),
);

/**
 * Records an n8n event id, so a repeat (n8n retrying after a timeout, say) is
 * answered "duplicate" and changes nothing. Returns the loan it is about, or a
 * result to answer with straight away.
 */
async function firstTimeForLoan(ctx: MutationCtx, eventId: string, type: string, loanId: string) {
  const seen = await ctx.db
    .query("inboundEvents")
    .withIndex("by_event_id", (q) => q.eq("eventId", eventId))
    .unique();
  if (seen !== null) {
    return { result: "duplicate" as const };
  }
  await ctx.db.insert("inboundEvents", { eventId, type });

  // The id comes from outside, so check it is really a loan id first.
  const id = ctx.db.normalizeId("loans", loanId);
  const loan = id === null ? null : await ctx.db.get("loans", id);
  return loan === null ? { result: "ignored" as const } : { loan };
}

/** n8n reports that it sent an overdue reminder to the borrower. */
export const recordReminderSent = internalMutation({
  args: { eventId: v.string(), loanId: v.string() },
  returns: reportResultValidator,
  handler: async (ctx, args) => {
    const first = await firstTimeForLoan(ctx, args.eventId, "reminder.sent", args.loanId);
    if (first.result) {
      return first.result;
    }
    if (first.loan.status !== "approved") {
      return "ignored";
    }
    await ctx.db.patch("loans", first.loan._id, { lastReminderOn: toIsoDate(Date.now()) });
    await addActivity(ctx, first.loan, "reminder.sent", ["borrower", "lender"]);
    return "processed";
  },
});

/** n8n reports that it emailed the lender or the borrower about a loan. */
export const recordEmailSent = internalMutation({
  args: { eventId: v.string(), loanId: v.string(), recipient: loanRoleValidator },
  returns: reportResultValidator,
  handler: async (ctx, args) => {
    const first = await firstTimeForLoan(ctx, args.eventId, "email.sent", args.loanId);
    if (first.result) {
      return first.result;
    }
    await addActivity(ctx, first.loan, "email.sent", [args.recipient]);
    return "processed";
  },
});
