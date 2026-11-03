import type { Infer } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { activityKindValidator, loanRoleValidator } from "../schema";

export type ActivityKind = Infer<typeof activityKindValidator>;
export type LoanRole = Infer<typeof loanRoleValidator>;

/** Adds a feed entry about `loan` for the lender, the borrower, or both. */
export async function addActivity(
  ctx: MutationCtx,
  loan: Doc<"loans">,
  kind: ActivityKind,
  roles: LoanRole[],
) {
  const [tool, lender, borrower] = await Promise.all([
    ctx.db.get("tools", loan.toolId),
    ctx.db.get("users", loan.lenderId),
    ctx.db.get("users", loan.borrowerId),
  ]);
  for (const role of roles) {
    const isLender = role === "lender";
    const other = isLender ? borrower : lender;
    await ctx.db.insert("activity", {
      userId: isLender ? loan.lenderId : loan.borrowerId,
      loanId: loan._id,
      kind,
      role,
      otherName: other?.displayName ?? "Unknown user",
      toolName: tool?.name ?? "Unknown tool",
      startDate: loan.startDate,
      endDate: loan.endDate,
      declineReason: loan.declineReason,
    });
  }
}
