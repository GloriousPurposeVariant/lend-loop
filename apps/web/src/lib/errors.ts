import { ConvexError } from "convex/values";

// Our Convex functions throw ConvexError({ code, message }) for expected failures.
// Anything else is unexpected, so we show a generic message instead of internals.
export function getErrorMessage(error: unknown): string {
  if (error instanceof ConvexError) {
    const data = error.data as { message?: unknown };
    if (typeof data.message === "string") {
      return data.message;
    }
  }
  return "Something went wrong. Please try again.";
}
