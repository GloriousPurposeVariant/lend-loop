import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { findUserByTokenIdentifier, getCurrentUser, requireAdmin } from "./lib/auth";
import { appError } from "./lib/errors";
import { roleValidator } from "./schema";

// Only the fields the UI needs; tokenIdentifier stays on the server.
const currentUserValidator = v.object({
  _id: v.id("users"),
  displayName: v.string(),
  email: v.string(),
  role: roleValidator,
  isTrustedLender: v.boolean(),
});

/** Creates or refreshes the caller's user row from their verified Clerk token. */
export const ensureCurrent = mutation({
  args: {},
  returns: v.id("users"),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw appError("UNAUTHENTICATED", "You must be signed in.");
    }
    if (!identity.email) {
      throw appError(
        "INVALID_INPUT",
        "Your sign-in token has no email. Check the Clerk JWT template.",
      );
    }
    const email = identity.email;
    const displayName = identity.name ?? email;

    const existing = await findUserByTokenIdentifier(ctx, identity.tokenIdentifier);
    if (existing !== null) {
      if (existing.email !== email || existing.displayName !== displayName) {
        await ctx.db.patch("users", existing._id, { email, displayName });
      }
      return existing._id;
    }

    // New accounts always start as a normal user. Role is never taken from the client.
    return await ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      email,
      displayName,
      role: "user",
      isTrustedLender: false,
    });
  },
});

/** The signed-in user's profile, or null when signed out or not set up yet. */
export const me = query({
  args: {},
  returns: v.union(currentUserValidator, v.null()),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (user === null) {
      return null;
    }
    return {
      _id: user._id,
      displayName: user.displayName,
      email: user.email,
      role: user.role,
      isTrustedLender: user.isTrustedLender,
    };
  },
});

/** Admin only: every member, A to Z by name, a page at a time. */
export const listForAdmin = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(currentUserValidator),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const result = await ctx.db
      .query("users")
      .withIndex("by_display_name")
      .paginate(args.paginationOpts);
    return {
      ...result,
      page: result.page.map((user) => ({
        _id: user._id,
        displayName: user.displayName,
        email: user.email,
        role: user.role,
        isTrustedLender: user.isTrustedLender,
      })),
    };
  },
});

/** Admin only: mark or unmark a lender as "Trusted Lender". */
export const setTrustedLender = mutation({
  args: { userId: v.id("users"), isTrustedLender: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const target = await ctx.db.get("users", args.userId);
    if (target === null) {
      throw appError("NOT_FOUND", "User not found.");
    }
    await ctx.db.patch("users", target._id, { isTrustedLender: args.isTrustedLender });
    return null;
  },
});

/**
 * Bootstraps the first admin. Internal, so browsers cannot call it. Run it with
 * the deployment admin key: npx convex run users:promoteToAdmin '{"email":"..."}'
 */
export const promoteToAdmin = internalMutation({
  args: { email: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();
    if (user === null) {
      throw appError("NOT_FOUND", "No user with that email. Sign in once first.");
    }
    await ctx.db.patch("users", user._id, { role: "admin" });
    return null;
  },
});
