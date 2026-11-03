import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { TOOL_IMAGE_LIMITS } from "./toolFields";

export const toolImageValidator = v.object({
  _id: v.id("toolImages"),
  url: v.string(),
});

/** A tool's photos, oldest first, with URLs the browser can load. */
export async function toolImages(ctx: QueryCtx, toolId: Id<"tools">) {
  const rows = await ctx.db
    .query("toolImages")
    .withIndex("by_tool", (q) => q.eq("toolId", toolId))
    .take(TOOL_IMAGE_LIMITS.maxPerTool);
  const images = [];
  for (const row of rows) {
    const url = await ctx.storage.getUrl(row.storageId);
    // Null only if the file was deleted from storage by hand.
    if (url !== null) {
      images.push({ _id: row._id, url });
    }
  }
  return images;
}
