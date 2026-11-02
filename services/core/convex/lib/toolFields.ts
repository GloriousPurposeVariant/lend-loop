import { v } from "convex/values";
import { appError } from "./errors";

// Single source of truth for tool fields. The web app imports these too, so the
// form's options and limits always match what the backend accepts. Categories are
// data (the categories table), not code; conditions are a fixed rating scale.

export const TOOL_CONDITIONS = ["new", "good", "fair", "worn"] as const;

export type ToolCondition = (typeof TOOL_CONDITIONS)[number];

export const toolConditionValidator = v.union(...TOOL_CONDITIONS.map((c) => v.literal(c)));

export const TOOL_LIMITS = {
  nameMin: 2,
  nameMax: 80,
  descriptionMax: 1000,
} as const;

/** Trims text fields and enforces length limits the validators cannot express. */
export function cleanToolText(input: { name: string; description: string }) {
  const name = input.name.trim();
  const description = input.description.trim();
  if (name.length < TOOL_LIMITS.nameMin || name.length > TOOL_LIMITS.nameMax) {
    throw appError(
      "INVALID_INPUT",
      `Name must be ${TOOL_LIMITS.nameMin}-${TOOL_LIMITS.nameMax} characters.`,
    );
  }
  if (description.length > TOOL_LIMITS.descriptionMax) {
    throw appError(
      "INVALID_INPUT",
      `Description must be at most ${TOOL_LIMITS.descriptionMax} characters.`,
    );
  }
  return { name, description };
}
