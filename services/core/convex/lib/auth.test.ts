import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import schema from "../schema";
import { alice, expectAppError, modules } from "../test.setup";
import { requireAdmin, requireOwner, requireOwnerOrAdmin, requireUser } from "./auth";

function fakeUser(id: string, role: "user" | "admin"): Doc<"users"> {
  return {
    _id: id as Id<"users">,
    _creationTime: 0,
    tokenIdentifier: `https://clerk.test|${id}`,
    email: `${id}@example.com`,
    displayName: id,
    role,
    isTrustedLender: false,
  };
}

describe("requireUser and requireAdmin", () => {
  test("requireUser rejects a signed-out caller", async () => {
    const t = convexTest(schema, modules);
    await expectAppError(
      t.run((ctx) => requireUser(ctx)),
      "UNAUTHENTICATED",
    );
  });

  test("requireUser rejects a valid token that has no user row yet", async () => {
    const t = convexTest(schema, modules);
    await expectAppError(
      t.withIdentity(alice).run((ctx) => requireUser(ctx)),
      "UNAUTHENTICATED",
    );
  });

  test("requireAdmin rejects a normal user and accepts an admin", async () => {
    const t = convexTest(schema, modules);
    await t.withIdentity(alice).mutation(api.users.ensureCurrent, {});
    await expectAppError(
      t.withIdentity(alice).run((ctx) => requireAdmin(ctx)),
      "FORBIDDEN",
    );

    await t.mutation(internal.users.promoteToAdmin, { email: alice.email });
    const admin = await t.withIdentity(alice).run((ctx) => requireAdmin(ctx));
    expect(admin.role).toBe("admin");
  });
});

describe("requireOwner and requireOwnerOrAdmin", () => {
  const owner = fakeUser("owner", "user");
  const stranger = fakeUser("stranger", "user");
  const admin = fakeUser("admin", "admin");

  test("only the owner passes requireOwner, even admins are refused", () => {
    expect(() => requireOwner(owner, owner._id)).not.toThrow();
    expect(() => requireOwner(stranger, owner._id)).toThrow();
    expect(() => requireOwner(admin, owner._id)).toThrow();
  });

  test("requireOwnerOrAdmin also lets an admin through", () => {
    expect(() => requireOwnerOrAdmin(owner, owner._id)).not.toThrow();
    expect(() => requireOwnerOrAdmin(admin, owner._id)).not.toThrow();
    expect(() => requireOwnerOrAdmin(stranger, owner._id)).toThrow();
  });
});
