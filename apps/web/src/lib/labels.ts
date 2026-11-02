import type { ToolCondition } from "@lendloop/core/convex/lib/toolFields";

// Record<ToolCondition, ...> makes TypeScript fail if a condition is added in the
// backend without a label here. Category labels live in the database instead.
export const CONDITION_LABELS: Record<ToolCondition, string> = {
  new: "New",
  good: "Good",
  fair: "Fair",
  worn: "Worn",
};
