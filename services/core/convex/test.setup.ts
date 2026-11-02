import { ConvexError } from "convex/values";
import { expect } from "vitest";

// Every Convex module (including _generated) except tests, for convexTest(schema, modules).
export const modules = import.meta.glob([
  "./**/*.ts",
  "./**/*.js",
  "!./**/*.test.ts",
  "!./test.setup.ts",
]);

export const alice = {
  subject: "user_alice",
  issuer: "https://clerk.test",
  email: "alice@example.com",
  name: "Alice",
};

export const bob = {
  subject: "user_bob",
  issuer: "https://clerk.test",
  email: "bob@example.com",
  name: "Bob",
};

/** Asserts that a Convex call failed with one of our appError codes. */
export async function expectAppError(promise: Promise<unknown>, code: string) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ConvexError);
  expect((error as ConvexError<{ code: string }>).data.code).toBe(code);
}
