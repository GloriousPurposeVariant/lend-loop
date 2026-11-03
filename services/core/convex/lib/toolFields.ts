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

export const TOOL_IMAGE_LIMITS = {
  maxPerTool: 6,
  maxBytes: 5 * 1024 * 1024,
  contentTypes: ["image/jpeg", "image/png", "image/webp"],
} as const;

/** Why this file cannot be a tool photo, or null if it can. Checked in the browser and in Convex. */
export function toolImageProblem(file: { contentType?: string; size: number }): string | null {
  if (!(TOOL_IMAGE_LIMITS.contentTypes as readonly string[]).includes(file.contentType ?? "")) {
    return "Photos must be JPEG, PNG or WebP images.";
  }
  if (file.size > TOOL_IMAGE_LIMITS.maxBytes) {
    return `Photos must be at most ${TOOL_IMAGE_LIMITS.maxBytes / (1024 * 1024)} MB.`;
  }
  return null;
}

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
