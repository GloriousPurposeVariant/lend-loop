import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { toolCategoryValidator, toolConditionValidator } from "./lib/toolFields";

export const roleValidator = v.union(v.literal("user"), v.literal("admin"));

export default defineSchema({
  users: defineTable({
    // "<issuer>|<subject>" from the verified Clerk JWT. Never sent by the client.
    tokenIdentifier: v.string(),
    email: v.string(),
    displayName: v.string(),
    role: roleValidator,
    isTrustedLender: v.boolean(),
  })
    .index("by_token_identifier", ["tokenIdentifier"])
    .index("by_email", ["email"]),

  tools: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    category: toolCategoryValidator,
    condition: toolConditionValidator,
    description: v.string(),
    // Soft delete: removed tools stay so past loans still point at a real row.
    status: v.union(v.literal("active"), v.literal("removed")),
    removedAt: v.optional(v.number()),
    removedBy: v.optional(v.id("users")),
  })
    .index("by_status", ["status"])
    .index("by_owner_and_status", ["ownerId", "status"]),
});
