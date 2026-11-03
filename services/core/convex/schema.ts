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

// Loan changes we tell n8n about.
export const loanEventTypeValidator = v.union(
  v.literal("loan.requested"),
  v.literal("loan.approved"),
  v.literal("loan.declined"),
  v.literal("loan.cancelled"),
  v.literal("loan.returned"),
);

// pending: not delivered yet (maybe retrying). skipped: no n8n URL configured.
export const deliveryStatusValidator = v.union(
  v.literal("pending"),
  v.literal("delivered"),
  v.literal("failed"),
  v.literal("skipped"),
);

// What can appear in a member's activity feed: the loan changes above, plus what n8n
// reports doing (an email about a loan, an overdue reminder).
export const activityKindValidator = v.union(
  ...loanEventTypeValidator.members,
  v.literal("email.sent"),
  v.literal("reminder.sent"),
);

export const loanRoleValidator = v.union(v.literal("lender"), v.literal("borrower"));

const personValidator = v.object({ name: v.string(), email: v.string() });

// What n8n needs to write an email about a loan. Emails go to n8n, our own service.
export const loanEventDataValidator = v.object({
  toolName: v.string(),
  startDate: v.string(),
  endDate: v.string(),
  declineReason: v.optional(declineReasonValidator),
  lender: personValidator,
  borrower: personValidator,
});

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
  // Photos of a tool. The file itself lives in Convex file storage; this row links it.
  toolImages: defineTable({
    toolId: v.id("tools"),
    storageId: v.id("_storage"),
  })
    .index("by_tool", ["toolId"])
    .index("by_storage", ["storageId"]),

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
    // "YYYY-MM-DD" of the last overdue reminder n8n reported, so it sends at most one a day.
    lastReminderOn: v.optional(v.string()),
  })
    // Overlap checks: approved (or pending) loans of a tool that end on or after a date.
    .index("by_tool_and_status_and_end", ["toolId", "status", "endDate"])
    // Overdue loans: approved loans that ended before today.
    .index("by_status_and_end", ["status", "endDate"])
    .index("by_borrower", ["borrowerId"])
    .index("by_lender", ["lenderId"]),

  // Outbox: one row per loan change for n8n, written in the same transaction as the
  // change itself, so an event is never lost and never sent for a change that failed.
  outboundEvents: defineTable({
    type: loanEventTypeValidator,
    loanId: v.id("loans"),
    // A snapshot at the time of the change, so a retry sends exactly the same thing.
    data: loanEventDataValidator,
    status: deliveryStatusValidator,
    attempts: v.number(),
    lastError: v.optional(v.string()),
    nextAttemptAt: v.optional(v.number()),
    deliveredAt: v.optional(v.number()),
  })
    .index("by_loan", ["loanId"])
    .index("by_status", ["status"]),

  // Ids of requests n8n has sent us. A repeated id is answered without acting twice.
  inboundEvents: defineTable({
    eventId: v.string(),
    type: v.string(),
  }).index("by_event_id", ["eventId"]),

  // Activity feeds: one row per person who should see an entry, written in the same
  // transaction as the change. Names are copied, so the feed reads as it happened.
  activity: defineTable({
    userId: v.id("users"),
    loanId: v.id("loans"),
    kind: activityKindValidator,
    // The feed owner's side of the loan, and the person on the other side.
    role: loanRoleValidator,
    otherName: v.string(),
    toolName: v.string(),
    startDate: v.string(),
    endDate: v.string(),
    declineReason: v.optional(declineReasonValidator),
  })
    .index("by_user", ["userId"])
    .index("by_loan", ["loanId"]),

  // Failed n8n runs, reported by the n8n Error Workflow, for the admin Automations page.
  workflowFailures: defineTable({
    workflowName: v.string(),
    nodeName: v.optional(v.string()),
    message: v.string(),
    executionId: v.string(),
    executionUrl: v.optional(v.string()),
  }),
});
