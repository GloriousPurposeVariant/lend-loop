import { ConvexError } from "convex/values";

export type ErrorCode = "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "INVALID_INPUT";

// ConvexError data reaches the client intact, so the UI can show `message`
// and branch on `code`. Other thrown errors are hidden from the client.
export function appError(code: ErrorCode, message: string) {
  return new ConvexError({ code, message });
}
