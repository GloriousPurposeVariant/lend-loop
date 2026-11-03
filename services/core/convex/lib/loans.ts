import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { addDays, rangesOverlap, type DateRange } from "./dates";
import { emitLoanEvent } from "./events";

// Loan rules shared by loans.ts and tools.ts.

const MAX_UPCOMING_SHOWN = 3;

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
    await emitLoanEvent(ctx, "loan.declined", loan._id);
  }
  return toDecline.length;
}

/**
 * Whether a tool is out right now, when it is expected back, and its next approved
 * bookings. Dates only: who borrowed it stays private.
 */
export async function toolAvailability(ctx: QueryCtx, toolId: Id<"tools">, today: string) {
  // Every approved loan, including overdue ones: the tool is out until marked returned.
  const approved = await loansEndingFrom(ctx, toolId, "approved", "");
  const current = approved.find((loan) => loan.startDate <= today);
  const upcoming = approved
    .filter((loan) => loan.startDate > today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .slice(0, MAX_UPCOMING_SHOWN)
    .map(({ startDate, endDate }) => ({ startDate, endDate }));

  return {
    availability: current ? ("onLoan" as const) : ("available" as const),
    // Only promised when the loan has not run past its end date.
    availableFrom: current && current.endDate >= today ? addDays(current.endDate, 1) : undefined,
    upcomingBookings: upcoming,
  };
}
