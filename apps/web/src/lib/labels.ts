import type { ToolCategory, ToolCondition } from "@lendloop/core/convex/lib/toolFields";

// Record<ToolCategory, ...> makes TypeScript fail if a category is added in the
// backend without a label here.
export const CATEGORY_LABELS: Record<ToolCategory, string> = {
  "power-tools": "Power tools",
  "hand-tools": "Hand tools",
  garden: "Garden",
  ladders: "Ladders",
  cleaning: "Cleaning",
  camping: "Camping",
  kitchen: "Kitchen",
  other: "Other",
};

export const CONDITION_LABELS: Record<ToolCondition, string> = {
  new: "New",
  good: "Good",
  fair: "Fair",
  worn: "Worn",
};
