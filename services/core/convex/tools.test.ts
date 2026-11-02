import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { alice, bob, expectAppError, modules } from "./test.setup";

type TestConvex = ReturnType<typeof convexTest>;

const drill = {
  name: "Cordless drill",
  category: "power-tools",
  condition: "good",
  description: "18V, two batteries.",
} as const;

const firstPage = { paginationOpts: { numItems: 10, cursor: null } };

/** Signs alice and bob up, and lists a drill as alice. */
async function setup(t: TestConvex) {
  await t.withIdentity(alice).mutation(api.users.ensureCurrent, {});
  await t.withIdentity(bob).mutation(api.users.ensureCurrent, {});
  const toolId = await t.withIdentity(alice).mutation(api.tools.create, drill);
  return { toolId };
}

describe("create", () => {
  test("rejects signed-out callers", async () => {
    const t = convexTest(schema, modules);
    await expectAppError(t.mutation(api.tools.create, drill), "UNAUTHENTICATED");
  });

  test("sets the owner from the caller and trims text", async () => {
    const t = convexTest(schema, modules);
    await t.withIdentity(alice).mutation(api.users.ensureCurrent, {});
    const toolId = await t
      .withIdentity(alice)
      .mutation(api.tools.create, { ...drill, name: "  Cordless drill  " });

    const tool = await t.run((ctx) => ctx.db.get("tools", toolId));
    const owner = await t.run((ctx) => ctx.db.get("users", tool!.ownerId));
    expect(tool?.name).toBe("Cordless drill");
    expect(tool?.status).toBe("active");
    expect(owner?.email).toBe(alice.email);
  });

  test("rejects an ownerId sent by the client", async () => {
    const t = convexTest(schema, modules);
    await t.withIdentity(alice).mutation(api.users.ensureCurrent, {});
    const bobId = await t.withIdentity(bob).mutation(api.users.ensureCurrent, {});
    // args has no ownerId, so Convex rejects the extra field before the handler runs.
    await expect(
      t.withIdentity(alice).mutation(api.tools.create, { ...drill, ownerId: bobId } as never),
    ).rejects.toThrow();
  });

  test("rejects a blank name and an unknown category", async () => {
    const t = convexTest(schema, modules);
    await t.withIdentity(alice).mutation(api.users.ensureCurrent, {});
    await expectAppError(
      t.withIdentity(alice).mutation(api.tools.create, { ...drill, name: "   " }),
      "INVALID_INPUT",
    );
    await expect(
      t.withIdentity(alice).mutation(api.tools.create, { ...drill, category: "boats" } as never),
    ).rejects.toThrow();
  });
});

describe("listPublic", () => {
  test("returns only name and category, even when signed out", async () => {
    const t = convexTest(schema, modules);
    await setup(t);
    const result = await t.query(api.tools.listPublic, firstPage);
    expect(result.page).toEqual([{ name: "Cordless drill", category: "power-tools" }]);
  });

  test("hides removed tools", async () => {
    const t = convexTest(schema, modules);
    const { toolId } = await setup(t);
    await t.withIdentity(alice).mutation(api.tools.remove, { toolId });
    const result = await t.query(api.tools.listPublic, firstPage);
    expect(result.page).toEqual([]);
  });
});

describe("listMine", () => {
  test("returns only the caller's tools", async () => {
    const t = convexTest(schema, modules);
    await setup(t);
    await t.withIdentity(bob).mutation(api.tools.create, { ...drill, name: "Ladder" });

    const mine = await t.withIdentity(alice).query(api.tools.listMine, {});
    expect(mine.map((tool) => tool.name)).toEqual(["Cordless drill"]);
  });
});

describe("remove", () => {
  test("refuses someone else's tool", async () => {
    const t = convexTest(schema, modules);
    const { toolId } = await setup(t);
    await expectAppError(t.withIdentity(bob).mutation(api.tools.remove, { toolId }), "FORBIDDEN");
  });

  test("lets an admin remove any tool and records who did it", async () => {
    const t = convexTest(schema, modules);
    const { toolId } = await setup(t);
    await t.mutation(internal.users.promoteToAdmin, { email: bob.email });

    await t.withIdentity(bob).mutation(api.tools.remove, { toolId });

    const tool = await t.run((ctx) => ctx.db.get("tools", toolId));
    const remover = await t.run((ctx) => ctx.db.get("users", tool!.removedBy!));
    expect(tool?.status).toBe("removed");
    expect(remover?.email).toBe(bob.email);
  });

  test("treats an already removed tool as not found", async () => {
    const t = convexTest(schema, modules);
    const { toolId } = await setup(t);
    await t.withIdentity(alice).mutation(api.tools.remove, { toolId });
    await expectAppError(t.withIdentity(alice).mutation(api.tools.remove, { toolId }), "NOT_FOUND");
  });
});
