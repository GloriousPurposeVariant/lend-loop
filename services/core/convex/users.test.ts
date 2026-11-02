import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { alice, bob, expectAppError, modules } from "./test.setup";

type TestConvex = ReturnType<typeof convexTest>;
type Identity = typeof alice;

async function signUp(t: TestConvex, identity: Identity) {
  return await t.withIdentity(identity).mutation(api.users.ensureCurrent, {});
}

describe("ensureCurrent", () => {
  test("rejects signed-out callers", async () => {
    const t = convexTest(schema, modules);
    await expectAppError(t.mutation(api.users.ensureCurrent, {}), "UNAUTHENTICATED");
  });

  test("creates a normal, untrusted user from the token", async () => {
    const t = convexTest(schema, modules);
    await signUp(t, alice);
    const me = await t.withIdentity(alice).query(api.users.me, {});
    expect(me).toMatchObject({
      email: "alice@example.com",
      displayName: "Alice",
      role: "user",
      isTrustedLender: false,
    });
  });

  test("is idempotent and refreshes the name", async () => {
    const t = convexTest(schema, modules);
    const firstId = await signUp(t, alice);
    const secondId = await signUp(t, { ...alice, name: "Alice B" });

    expect(secondId).toBe(firstId);
    const users = await t.run((ctx) => ctx.db.query("users").collect());
    expect(users).toHaveLength(1);
    expect(users[0].displayName).toBe("Alice B");
  });

  test("rejects a token without an email", async () => {
    const t = convexTest(schema, modules);
    const noEmail = { subject: "user_x", issuer: "https://clerk.test" };
    await expectAppError(
      t.withIdentity(noEmail).mutation(api.users.ensureCurrent, {}),
      "INVALID_INPUT",
    );
  });

  test("rejects a role sent by the client", async () => {
    const t = convexTest(schema, modules);
    // args is {}, so Convex rejects any extra field before the handler runs.
    await expect(
      t.withIdentity(alice).mutation(api.users.ensureCurrent, { role: "admin" } as never),
    ).rejects.toThrow();
  });
});

describe("me", () => {
  test("returns null when signed out", async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.users.me, {})).toBeNull();
  });

  test("does not expose the token identifier", async () => {
    const t = convexTest(schema, modules);
    await signUp(t, alice);
    const me = await t.withIdentity(alice).query(api.users.me, {});
    expect(me).not.toHaveProperty("tokenIdentifier");
  });
});

describe("setTrustedLender", () => {
  test("rejects normal users", async () => {
    const t = convexTest(schema, modules);
    const bobId = await signUp(t, bob);
    await signUp(t, alice);
    await expectAppError(
      t
        .withIdentity(alice)
        .mutation(api.users.setTrustedLender, { userId: bobId, isTrustedLender: true }),
      "FORBIDDEN",
    );
  });

  test("lets an admin mark a lender as trusted", async () => {
    const t = convexTest(schema, modules);
    const bobId = await signUp(t, bob);
    await signUp(t, alice);
    await t.mutation(internal.users.promoteToAdmin, { email: alice.email });

    await t
      .withIdentity(alice)
      .mutation(api.users.setTrustedLender, { userId: bobId, isTrustedLender: true });

    const bobProfile = await t.withIdentity(bob).query(api.users.me, {});
    expect(bobProfile?.isTrustedLender).toBe(true);
  });
});

describe("promoteToAdmin", () => {
  test("fails for an unknown email", async () => {
    const t = convexTest(schema, modules);
    await expectAppError(
      t.mutation(internal.users.promoteToAdmin, { email: "nobody@example.com" }),
      "NOT_FOUND",
    );
  });
});
