import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { rangesOverlap, type DateRange } from "./dates";

// Loan rules shared by loans.ts and tools.ts.

/** Loans of a tool in one status that end on or after `fromDate`. */
export async function loansEndingFrom(
  ctx: QueryCtx,
  toolId: Id<"tools">,
  status: "pending" | "approved",
  fromDate: string,
): Promise<Doc<"loans">[]> {
  // Bounded: only loans that have not ended before `fromDate`, and bookings are
  // limited to MAX_DAYS_AHEAD, so a tool has few of these at any time.
  return await ctx.db
    .query("loans")
    .withIndex("by_tool_and_status_and_end", (q) =>
      q.eq("toolId", toolId).eq("status", status).gte("endDate", fromDate),
    )
    .collect();
}

/** The first approved loan of this tool that shares at least one day with `range`. */
export async function findApprovedOverlap(
  ctx: QueryCtx,
  toolId: Id<"tools">,
  range: DateRange,
): Promise<Doc<"loans"> | null> {
  const candidates = await loansEndingFrom(ctx, toolId, "approved", range.startDate);
  return candidates.find((loan) => rangesOverlap(loan, range)) ?? null;
}

/**
 * Declines pending requests for a tool. With `range`, only those overlapping it
 * (after an approval); without, all of them (after the tool is removed).
 */
export async function declinePendingRequests(
  ctx: MutationCtx,
  toolId: Id<"tools">,
  reason: "conflict" | "toolRemoved",
  range?: DateRange,
): Promise<number> {
  const pending = await loansEndingFrom(ctx, toolId, "pending", range?.startDate ?? "");
  const toDecline = range ? pending.filter((loan) => rangesOverlap(loan, range)) : pending;
  const now = Date.now();
  for (const loan of toDecline) {
    await ctx.db.patch("loans", loan._id, {
      status: "declined",
      declineReason: reason,
      decidedAt: now,
    });
  }
  return toDecline.length;
}
