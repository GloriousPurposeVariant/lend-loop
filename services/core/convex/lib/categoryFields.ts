import { appError } from "./errors";

// Starting categories for a new deployment, loaded by categories:seed.
export const DEFAULT_CATEGORY_LABELS = [
  "Power tools",
  "Hand tools",
  "Garden",
  "Ladders",
  "Cleaning",
  "Camping",
  "Kitchen",
  "Other",
] as const;

export const CATEGORY_LIMITS = {
  labelMin: 2,
  labelMax: 40,
} as const;

/** "Power tools" -> "power-tools". The slug never changes, even if the label is renamed. */
export function slugify(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Trims a label and enforces its length. */
export function cleanCategoryLabel(input: string): string {
  const label = input.trim();
  if (label.length < CATEGORY_LIMITS.labelMin || label.length > CATEGORY_LIMITS.labelMax) {
    throw appError(
      "INVALID_INPUT",
      `Category name must be ${CATEGORY_LIMITS.labelMin}-${CATEGORY_LIMITS.labelMax} characters.`,
    );
  }
  return label;
}
