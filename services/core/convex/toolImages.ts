import { v } from "convex/values";
import { internalMutation, mutation } from "./_generated/server";
import { requireOwner, requireUser } from "./lib/auth";
import { appError } from "./lib/errors";
import { TOOL_IMAGE_LIMITS, toolImageProblem } from "./lib/toolFields";

// Photo upload is two steps, because files go straight to Convex storage, not through
// a mutation: 1. generateUploadUrl, 2. the browser POSTs the file there and gets a
// storageId, 3. add links that file to a tool after checking it.

/** A short-lived URL the browser can upload one file to. */
export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireUser(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/** Attach an uploaded file to one of the caller's tools. */
export const add = mutation({
  args: { toolId: v.id("tools"), storageId: v.id("_storage") },
  returns: v.id("toolImages"),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const tool = await ctx.db.get("tools", args.toolId);
    if (tool === null || tool.status === "removed") {
      throw appError("NOT_FOUND", "Tool not found.");
    }
    requireOwner(user, tool.ownerId);

    const file = await ctx.db.system.get("_storage", args.storageId);
    if (file === null) {
      throw appError("NOT_FOUND", "Upload not found. Please try again.");
    }
    // One file, one photo. If two photos shared a file, removing one would delete
    // the other's file too. It also stops anyone attaching a file they did not upload.
    const alreadyAttached = await ctx.db
      .query("toolImages")
      .withIndex("by_storage", (q) => q.eq("storageId", args.storageId))
      .unique();
    if (alreadyAttached !== null) {
      throw appError("INVALID_INPUT", "This photo is already attached to a tool.");
    }
    // The browser checks these too, but anyone can call this API directly.
    const problem = toolImageProblem(file);
    if (problem !== null) {
      throw appError("INVALID_INPUT", problem);
    }
    const existing = await ctx.db
      .query("toolImages")
      .withIndex("by_tool", (q) => q.eq("toolId", tool._id))
      .take(TOOL_IMAGE_LIMITS.maxPerTool);
    if (existing.length >= TOOL_IMAGE_LIMITS.maxPerTool) {
      throw appError(
        "INVALID_INPUT",
        `A tool can have at most ${TOOL_IMAGE_LIMITS.maxPerTool} photos.`,
      );
    }
    // A rejected file is not deleted here: throwing undoes the whole mutation,
    // deletes included. deleteUnattached cleans it up instead.
    return await ctx.db.insert("toolImages", { toolId: tool._id, storageId: args.storageId });
  },
});

/** Remove a photo from one of the caller's tools, and delete the file. */
export const remove = mutation({
  args: { imageId: v.id("toolImages") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const image = await ctx.db.get("toolImages", args.imageId);
    const tool = image === null ? null : await ctx.db.get("tools", image.toolId);
    if (image === null || tool === null) {
      throw appError("NOT_FOUND", "Photo not found.");
    }
    requireOwner(user, tool.ownerId);
    await ctx.db.delete("toolImages", image._id);
    await ctx.storage.delete(image.storageId);
    return null;
  },
});

// An upload gets this long to be attached before it counts as abandoned.
const ATTACH_GRACE_MS = 60 * 60 * 1000;
// Each hourly run looks back this far, so a missed run is caught up by the next one.
const SWEEP_WINDOW_MS = 24 * 60 * 60 * 1000;
const SWEEP_BATCH = 500;

/**
 * Deletes uploads that never got attached to a tool: rejected files, or a browser
 * that closed between upload and attach. Runs hourly from crons.ts.
 * Every file in storage is a tool photo; new kinds of upload must be checked here too.
 */
export const deleteUnattached = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const cutoff = Date.now() - ATTACH_GRACE_MS;
    const files = await ctx.db.system
      .query("_storage")
      .withIndex("by_creation_time", (q) =>
        q.gte("_creationTime", cutoff - SWEEP_WINDOW_MS).lt("_creationTime", cutoff),
      )
      .take(SWEEP_BATCH);
    let deleted = 0;
    for (const file of files) {
      const image = await ctx.db
        .query("toolImages")
        .withIndex("by_storage", (q) => q.eq("storageId", file._id))
        .unique();
      if (image === null) {
        await ctx.storage.delete(file._id);
        deleted++;
      }
    }
    return deleted;
  },
});
