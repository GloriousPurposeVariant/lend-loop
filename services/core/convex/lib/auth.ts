import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { appError } from "./errors";

// Every public query and mutation gets the caller from here, never from its arguments.
// QueryCtx also accepts a MutationCtx, so these work in both.

export async function getCurrentUser(ctx: QueryCtx): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) {
    return null;
  }
  return await findUserByTokenIdentifier(ctx, identity.tokenIdentifier);
}

export async function requireUser(ctx: QueryCtx): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) {
    throw appError("UNAUTHENTICATED", "You must be signed in.");
  }
  const user = await findUserByTokenIdentifier(ctx, identity.tokenIdentifier);
  if (user === null) {
    throw appError("UNAUTHENTICATED", "Your account is still being set up. Please retry.");
  }
  return user;
}

export async function requireAdmin(ctx: QueryCtx): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (user.role !== "admin") {
    throw appError("FORBIDDEN", "Only admins can do this.");
  }
  return user;
}

export function requireOwner(user: Doc<"users">, ownerId: Id<"users">): void {
  if (user._id !== ownerId) {
    throw appError("FORBIDDEN", "You can only change your own items.");
  }
}

export function requireOwnerOrAdmin(user: Doc<"users">, ownerId: Id<"users">): void {
  if (user.role === "admin") {
    return;
  }
  requireOwner(user, ownerId);
}

export async function findUserByTokenIdentifier(ctx: QueryCtx, tokenIdentifier: string) {
  return await ctx.db
    .query("users")
    .withIndex("by_token_identifier", (q) => q.eq("tokenIdentifier", tokenIdentifier))
    .unique();
}
