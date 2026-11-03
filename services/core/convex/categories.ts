import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { requireAdmin } from "./lib/auth";
import { ensureDefaultCategories } from "./lib/categories";
import { cleanCategoryLabel, slugify } from "./lib/categoryFields";
import { appError } from "./lib/errors";

const categoryValidator = v.object({
  _id: v.id("categories"),
  slug: v.string(),
  label: v.string(),
  isActive: v.boolean(),
});

/** Categories people can pick when listing a tool, A to Z. Public: they hold no user data. */
export const listActive = query({
  args: {},
  returns: v.array(categoryValidator),
  handler: async (ctx) => {
    const categories = await ctx.db
      .query("categories")
      .withIndex("by_active_and_label", (q) => q.eq("isActive", true))
      .take(200);
    return categories.map(({ _id, slug, label, isActive }) => ({ _id, slug, label, isActive }));
  },
});

/** Admin only: every category, including deactivated ones. */
export const listAll = query({
  args: {},
  returns: v.array(categoryValidator),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const categories = await ctx.db.query("categories").withIndex("by_label").take(200);
    return categories.map(({ _id, slug, label, isActive }) => ({ _id, slug, label, isActive }));
  },
});

/** Admin only: add a category. The slug is derived from the label and must be unique. */
export const create = mutation({
  args: { label: v.string() },
  returns: v.id("categories"),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const label = cleanCategoryLabel(args.label);
    const slug = slugify(label);
    if (slug === "") {
      throw appError("INVALID_INPUT", "Category name needs at least one letter or number.");
    }
    const existing = await ctx.db
      .query("categories")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (existing !== null) {
      throw appError("INVALID_INPUT", `A category called "${existing.label}" already exists.`);
    }
    return await ctx.db.insert("categories", { slug, label, isActive: true });
  },
});

/** Admin only: change the label people see. The slug stays the same. */
export const rename = mutation({
  args: { categoryId: v.id("categories"), label: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const category = await ctx.db.get("categories", args.categoryId);
    if (category === null) {
      throw appError("NOT_FOUND", "Category not found.");
    }
    const label = cleanCategoryLabel(args.label);
    const sameLabel = await ctx.db
      .query("categories")
      .withIndex("by_label", (q) => q.eq("label", label))
      .first();
    if (sameLabel !== null && sameLabel._id !== category._id) {
      throw appError("INVALID_INPUT", `A category called "${label}" already exists.`);
    }
    await ctx.db.patch("categories", category._id, { label });
    return null;
  },
});

/** Admin only: hide a category from the form, or bring it back. Existing tools keep it. */
export const setActive = mutation({
  args: { categoryId: v.id("categories"), isActive: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const category = await ctx.db.get("categories", args.categoryId);
    if (category === null) {
      throw appError("NOT_FOUND", "Category not found.");
    }
    await ctx.db.patch("categories", category._id, { isActive: args.isActive });
    return null;
  },
});

/**
 * Loads the default categories. Safe to run again: it only adds missing ones.
 * Run with: npm run categories:seed
 */
export const seed = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    return await ensureDefaultCategories(ctx);
  },
});
