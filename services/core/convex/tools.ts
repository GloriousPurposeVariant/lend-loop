import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireOwnerOrAdmin, requireUser } from "./lib/auth";
import { appError } from "./lib/errors";
import { cleanToolText, toolCategoryValidator, toolConditionValidator } from "./lib/toolFields";

// What anyone, signed in or not, may see about a tool. The `returns` validator
// enforces it: returning any other field makes the query fail.
const publicToolValidator = v.object({
  name: v.string(),
  category: toolCategoryValidator,
});

const ownToolValidator = v.object({
  _id: v.id("tools"),
  _creationTime: v.number(),
  name: v.string(),
  category: toolCategoryValidator,
  condition: toolConditionValidator,
  description: v.string(),
});

/** Public tool board: name and category only, newest first. */
export const listPublic = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(publicToolValidator),
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("tools")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      ...result,
      page: result.page.map((tool) => ({ name: tool.name, category: tool.category })),
    };
  },
});

/** The caller's own active listings, newest first. */
export const listMine = query({
  args: {},
  returns: v.array(ownToolValidator),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const tools = await ctx.db
      .query("tools")
      .withIndex("by_owner_and_status", (q) => q.eq("ownerId", user._id).eq("status", "active"))
      .order("desc")
      .take(100);
    return tools.map((tool) => ({
      _id: tool._id,
      _creationTime: tool._creationTime,
      name: tool.name,
      category: tool.category,
      condition: tool.condition,
      description: tool.description,
    }));
  },
});

/** List a tool. The owner is always the caller. */
export const create = mutation({
  args: {
    name: v.string(),
    category: toolCategoryValidator,
    condition: toolConditionValidator,
    description: v.string(),
  },
  returns: v.id("tools"),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const { name, description } = cleanToolText(args);
    return await ctx.db.insert("tools", {
      ownerId: user._id,
      name,
      category: args.category,
      condition: args.condition,
      description,
      status: "active",
    });
  },
});

/** Owners can remove their own listing; admins can remove any listing. */
export const remove = mutation({
  args: { toolId: v.id("tools") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const tool = await ctx.db.get("tools", args.toolId);
    if (tool === null || tool.status === "removed") {
      throw appError("NOT_FOUND", "Tool not found.");
    }
    requireOwnerOrAdmin(user, tool.ownerId);
    await ctx.db.patch("tools", tool._id, {
      status: "removed",
      removedAt: Date.now(),
      removedBy: user._id,
    });
    return null;
  },
});
