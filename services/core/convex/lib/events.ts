import type { Infer } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { loanEventTypeValidator } from "../schema";

export type LoanEventType = Infer<typeof loanEventTypeValidator>;

/**
 * Records a loan change for n8n and schedules its delivery. Call it in the same
 * mutation as the change: if the mutation fails, the event and the scheduled
 * delivery are undone with it.
 */
export async function emitLoanEvent(ctx: MutationCtx, type: LoanEventType, loanId: Id<"loans">) {
  const loan = await ctx.db.get("loans", loanId);
  if (loan === null) {
    throw new Error(`emitLoanEvent: loan ${loanId} not found`);
  }
  const [tool, lender, borrower] = await Promise.all([
    ctx.db.get("tools", loan.toolId),
    ctx.db.get("users", loan.lenderId),
    ctx.db.get("users", loan.borrowerId),
  ]);
  const eventId = await ctx.db.insert("outboundEvents", {
    type,
    loanId,
    data: {
      toolName: tool?.name ?? "Unknown tool",
      startDate: loan.startDate,
      endDate: loan.endDate,
      declineReason: loan.declineReason,
      lender: { name: lender?.displayName ?? "Unknown user", email: lender?.email ?? "" },
      borrower: { name: borrower?.displayName ?? "Unknown user", email: borrower?.email ?? "" },
    },
    status: "pending",
    attempts: 0,
  });
  await ctx.scheduler.runAfter(0, internal.webhooks.deliver, { eventId });
}
