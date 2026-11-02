import type { TestConvex as ConvexTestFor } from "convex-test";
import { ConvexError } from "convex/values";
import { expect } from "vitest";
import { internal } from "./_generated/api";
import type schema from "./schema";

/** A convexTest instance that knows our tables and indexes. */
export type TestConvex = ConvexTestFor<typeof schema>;

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

/** Loads the default categories and returns the id of the one with this slug. */
export async function seedCategory(t: TestConvex, slug = "power-tools") {
  await t.mutation(internal.categories.seed, {});
  const category = await t.run((ctx) =>
    ctx.db
      .query("categories")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique(),
  );
  if (category === null) {
    throw new Error(`No default category with slug "${slug}".`);
  }
  return category._id;
}

/** Asserts that a Convex call failed with one of our appError codes. */
export async function expectAppError(promise: Promise<unknown>, code: string) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ConvexError);
  expect((error as ConvexError<{ code: string }>).data.code).toBe(code);
}
