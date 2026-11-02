import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { requireOwnerOrAdmin, requireUser } from "./lib/auth";
import { appError } from "./lib/errors";
import { cleanToolText, toolConditionValidator } from "./lib/toolFields";

// What anyone, signed in or not, may see about a tool. The `returns` validator
// enforces it: returning any other field makes the query fail.
const publicToolValidator = v.object({
  name: v.string(),
  category: v.string(),
});

const ownToolValidator = v.object({
  _id: v.id("tools"),
  _creationTime: v.number(),
  name: v.string(),
  categoryId: v.id("categories"),
  categoryLabel: v.string(),
  condition: toolConditionValidator,
  description: v.string(),
});

async function categoryLabel(ctx: QueryCtx, categoryId: Id<"categories">) {
  const category = await ctx.db.get("categories", categoryId);
  // Categories are never deleted, so this fallback only guards against bad data.
  return category?.label ?? "Uncategorised";
}

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
    const page = await Promise.all(
      result.page.map(async (tool) => ({
        name: tool.name,
        category: await categoryLabel(ctx, tool.categoryId),
      })),
    );
    return { ...result, page };
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
    return await Promise.all(
      tools.map(async (tool) => ({
        _id: tool._id,
        _creationTime: tool._creationTime,
        name: tool.name,
        categoryId: tool.categoryId,
        categoryLabel: await categoryLabel(ctx, tool.categoryId),
        condition: tool.condition,
        description: tool.description,
      })),
    );
  },
});

/** List a tool. The owner is always the caller. */
export const create = mutation({
  args: {
    name: v.string(),
    categoryId: v.id("categories"),
    condition: toolConditionValidator,
    description: v.string(),
  },
  returns: v.id("tools"),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const { name, description } = cleanToolText(args);
    const category = await ctx.db.get("categories", args.categoryId);
    if (category === null || !category.isActive) {
      throw appError("INVALID_INPUT", "Choose one of the available categories.");
    }
    return await ctx.db.insert("tools", {
      ownerId: user._id,
      name,
      categoryId: category._id,
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
