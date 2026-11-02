import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { toolConditionValidator } from "./lib/toolFields";

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

  // Managed by admins. Never deleted, only deactivated, so tools always point at a real row.
  categories: defineTable({
    slug: v.string(),
    label: v.string(),
    isActive: v.boolean(),
  })
    .index("by_slug", ["slug"])
    .index("by_label", ["label"])
    .index("by_active_and_label", ["isActive", "label"]),

  tools: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    categoryId: v.id("categories"),
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
