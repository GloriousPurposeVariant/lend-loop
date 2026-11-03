import type { MutationCtx } from "../_generated/server";
import { DEFAULT_CATEGORY_LABELS, slugify } from "./categoryFields";

/** Adds any default category that is missing. Returns how many were added. */
export async function ensureDefaultCategories(ctx: MutationCtx): Promise<number> {
  let added = 0;
  for (const label of DEFAULT_CATEGORY_LABELS) {
    const slug = slugify(label);
    const existing = await ctx.db
      .query("categories")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (existing === null) {
      await ctx.db.insert("categories", { slug, label, isActive: true });
      added++;
    }
  }
  return added;
}
