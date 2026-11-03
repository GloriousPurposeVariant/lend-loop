import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { activityKindValidator, declineReasonValidator, loanRoleValidator } from "./schema";

const activityValidator = v.object({
  _id: v.id("activity"),
  _creationTime: v.number(),
  kind: activityKindValidator,
  role: loanRoleValidator,
  otherName: v.string(),
  toolName: v.string(),
  startDate: v.string(),
  endDate: v.string(),
  declineReason: v.optional(declineReasonValidator),
});

/** The caller's activity feed, newest first. Only ever their own entries. */
export const listMine = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(activityValidator),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const result = await ctx.db
      .query("activity")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      ...result,
      page: result.page.map((entry) => ({
        _id: entry._id,
        _creationTime: entry._creationTime,
        kind: entry.kind,
        role: entry.role,
        otherName: entry.otherName,
        toolName: entry.toolName,
        startDate: entry.startDate,
        endDate: entry.endDate,
        declineReason: entry.declineReason,
      })),
    };
  },
});
