import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { requireAdmin, requireOwner, requireUser } from "./lib/auth";
import { earliestStartDate, validateLoanDates } from "./lib/dates";
import { appError } from "./lib/errors";
import { emitLoanEvent } from "./lib/events";
import { declinePendingRequests, findApprovedOverlap, loansEndingFrom } from "./lib/loans";
import { declineReasonValidator, loanStatusValidator } from "./schema";

// What the UI shows about a loan: names instead of ids, and no emails.
const loanSummaryValidator = v.object({
  _id: v.id("loans"),
  _creationTime: v.number(),
  toolName: v.string(),
  lenderName: v.string(),
  borrowerName: v.string(),
  startDate: v.string(),
  endDate: v.string(),
  status: loanStatusValidator,
  declineReason: v.optional(declineReasonValidator),
});

async function summarize(ctx: QueryCtx, loan: Doc<"loans">) {
  const [tool, lender, borrower] = await Promise.all([
    ctx.db.get("tools", loan.toolId),
    ctx.db.get("users", loan.lenderId),
    ctx.db.get("users", loan.borrowerId),
  ]);
  return {
    _id: loan._id,
    _creationTime: loan._creationTime,
    toolName: tool?.name ?? "Unknown tool",
    lenderName: lender?.displayName ?? "Unknown user",
    borrowerName: borrower?.displayName ?? "Unknown user",
    startDate: loan.startDate,
    endDate: loan.endDate,
    status: loan.status,
    declineReason: loan.declineReason,
  };
}

/** Loads a loan or fails with NOT_FOUND. */
async function getLoan(ctx: MutationCtx, loanId: Id<"loans">) {
  const loan = await ctx.db.get("loans", loanId);
  if (loan === null) {
    throw appError("NOT_FOUND", "Request not found.");
  }
  return loan;
}

function requireStatus(loan: Doc<"loans">, status: Doc<"loans">["status"]) {
  if (loan.status !== status) {
    throw appError("INVALID_INPUT", `This request is ${loan.status}, not ${status}.`);
  }
}

/** Ask to borrow a tool for a date range. The borrower is always the caller. */
export const request = mutation({
  args: { toolId: v.id("tools"), startDate: v.string(), endDate: v.string() },
  returns: v.id("loans"),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const tool = await ctx.db.get("tools", args.toolId);
    if (tool === null || tool.status !== "active") {
      throw appError("NOT_FOUND", "Tool not found.");
    }
    if (tool.ownerId === user._id) {
      throw appError("INVALID_INPUT", "You cannot borrow your own tool.");
    }
    const range = { startDate: args.startDate, endDate: args.endDate };
    validateLoanDates(range, Date.now());

    if ((await findApprovedOverlap(ctx, tool._id, range)) !== null) {
      throw appError("INVALID_INPUT", "This tool is already booked for some of those dates.");
    }
    const livePending = await loansEndingFrom(
      ctx,
      tool._id,
      "pending",
      earliestStartDate(Date.now()),
    );
    if (livePending.some((loan) => loan.borrowerId === user._id)) {
      throw appError("INVALID_INPUT", "You already have a pending request for this tool.");
    }

    const loanId = await ctx.db.insert("loans", {
      toolId: tool._id,
      lenderId: tool.ownerId,
      borrowerId: user._id,
      startDate: range.startDate,
      endDate: range.endDate,
      status: "pending",
    });
    await emitLoanEvent(ctx, "loan.requested", loanId);
    return loanId;
  },
});

/**
 * Lender approves a request. The overlap check runs again here: another request
 * may have been approved since this one was made. Convex runs mutations as
 * serializable transactions, so two approvals cannot both pass this check.
 */
export const approve = mutation({
  args: { loanId: v.id("loans") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const loan = await getLoan(ctx, args.loanId);
    requireOwner(user, loan.lenderId);
    requireStatus(loan, "pending");

    const tool = await ctx.db.get("tools", loan.toolId);
    if (tool === null || tool.status !== "active") {
      throw appError("INVALID_INPUT", "This tool has been removed.");
    }
    if (loan.endDate < earliestStartDate(Date.now())) {
      throw appError("INVALID_INPUT", "These dates have already passed. Decline the request.");
    }
    if ((await findApprovedOverlap(ctx, loan.toolId, loan)) !== null) {
      throw appError("INVALID_INPUT", "Another approved loan already covers some of these dates.");
    }

    await ctx.db.patch("loans", loan._id, { status: "approved", decidedAt: Date.now() });
    await emitLoanEvent(ctx, "loan.approved", loan._id);
    // The approved loan now blocks these dates, so overlapping requests cannot succeed.
    await declinePendingRequests(ctx, loan.toolId, "conflict", loan);
    return null;
  },
});

/** Lender declines a pending request. */
export const decline = mutation({
  args: { loanId: v.id("loans") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const loan = await getLoan(ctx, args.loanId);
    requireOwner(user, loan.lenderId);
    requireStatus(loan, "pending");
    await ctx.db.patch("loans", loan._id, { status: "declined", decidedAt: Date.now() });
    await emitLoanEvent(ctx, "loan.declined", loan._id);
    return null;
  },
});

/** Borrower withdraws their own pending request. */
export const cancel = mutation({
  args: { loanId: v.id("loans") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const loan = await getLoan(ctx, args.loanId);
    requireOwner(user, loan.borrowerId);
    requireStatus(loan, "pending");
    await ctx.db.patch("loans", loan._id, { status: "cancelled", decidedAt: Date.now() });
    await emitLoanEvent(ctx, "loan.cancelled", loan._id);
    return null;
  },
});

/** Lender confirms the tool came back. Only the lender knows it is back in their hands. */
export const markReturned = mutation({
  args: { loanId: v.id("loans") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const loan = await getLoan(ctx, args.loanId);
    requireOwner(user, loan.lenderId);
    requireStatus(loan, "approved");
    await ctx.db.patch("loans", loan._id, { status: "returned", returnedAt: Date.now() });
    await emitLoanEvent(ctx, "loan.returned", loan._id);
    return null;
  },
});

/** Requests the caller has made, newest first. */
export const listMyRequests = query({
  args: {},
  returns: v.array(loanSummaryValidator),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_borrower", (q) => q.eq("borrowerId", user._id))
      .order("desc")
      .take(100);
    return await Promise.all(loans.map((loan) => summarize(ctx, loan)));
  },
});

/** Requests for the caller's tools, newest first. */
export const listIncoming = query({
  args: {},
  returns: v.array(loanSummaryValidator),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_lender", (q) => q.eq("lenderId", user._id))
      .order("desc")
      .take(100);
    return await Promise.all(loans.map((loan) => summarize(ctx, loan)));
  },
});

/** Admin only: every loan, newest first. */
export const listAll = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(loanSummaryValidator),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const result = await ctx.db.query("loans").order("desc").paginate(args.paginationOpts);
    const page = await Promise.all(result.page.map((loan) => summarize(ctx, loan)));
    return { ...result, page };
  },
});
