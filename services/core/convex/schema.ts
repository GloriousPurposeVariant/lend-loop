import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { toolConditionValidator } from "./lib/toolFields";

export const roleValidator = v.union(v.literal("user"), v.literal("admin"));

export const loanStatusValidator = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("declined"),
  v.literal("cancelled"),
  v.literal("returned"),
);

// Why a request was declined without the lender pressing "Decline".
export const declineReasonValidator = v.union(v.literal("conflict"), v.literal("toolRemoved"));

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
    .index("by_email", ["email"])
    .index("by_display_name", ["displayName"]),

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
    .index("by_status_and_category", ["status", "categoryId"])
    .index("by_owner_and_status", ["ownerId", "status"])
    // Browse search: words in the name, narrowed by status and optionally category.
    .searchIndex("search_name", { searchField: "name", filterFields: ["status", "categoryId"] }),

  // One row per borrow request, from request to return:
  // pending -> approved -> returned, or pending -> declined / cancelled.
  loans: defineTable({
    toolId: v.id("tools"),
    // Copied from the tool when requested, so "incoming requests" is one index lookup.
    lenderId: v.id("users"),
    borrowerId: v.id("users"),
    startDate: v.string(), // "YYYY-MM-DD"
    endDate: v.string(), // "YYYY-MM-DD", inclusive
    status: loanStatusValidator,
    declineReason: v.optional(declineReasonValidator),
    decidedAt: v.optional(v.number()),
    returnedAt: v.optional(v.number()),
  })
    // Overlap checks: approved (or pending) loans of a tool that end on or after a date.
    .index("by_tool_and_status_and_end", ["toolId", "status", "endDate"])
    .index("by_borrower", ["borrowerId"])
    .index("by_lender", ["lenderId"]),
});
