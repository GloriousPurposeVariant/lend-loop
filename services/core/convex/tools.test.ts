import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { alice, bob, expectAppError, modules, seedCategory, type TestConvex } from "./test.setup";

const firstPage = { paginationOpts: { numItems: 10, cursor: null } };

function drill(categoryId: Id<"categories">) {
  return {
    name: "Cordless drill",
    categoryId,
    condition: "good",
    description: "18V, two batteries.",
  } as const;
}

/** Signs alice and bob up, and lists a drill as alice. */
async function setup(t: TestConvex) {
  const categoryId = await seedCategory(t);
  await t.withIdentity(alice).mutation(api.users.ensureCurrent, {});
  await t.withIdentity(bob).mutation(api.users.ensureCurrent, {});
  const toolId = await t.withIdentity(alice).mutation(api.tools.create, drill(categoryId));
  return { toolId, categoryId };
}

describe("create", () => {
  test("rejects signed-out callers", async () => {
    const t = convexTest(schema, modules);
    const categoryId = await seedCategory(t);
    await expectAppError(t.mutation(api.tools.create, drill(categoryId)), "UNAUTHENTICATED");
  });

  test("sets the owner from the caller and trims text", async () => {
    const t = convexTest(schema, modules);
    const categoryId = await seedCategory(t);
    await t.withIdentity(alice).mutation(api.users.ensureCurrent, {});
    const toolId = await t
      .withIdentity(alice)
      .mutation(api.tools.create, { ...drill(categoryId), name: "  Cordless drill  " });

    const tool = await t.run((ctx) => ctx.db.get("tools", toolId));
    const owner = await t.run((ctx) => ctx.db.get("users", tool!.ownerId));
    expect(tool?.name).toBe("Cordless drill");
    expect(tool?.status).toBe("active");
    expect(owner?.email).toBe(alice.email);
  });

  test("rejects an ownerId sent by the client", async () => {
    const t = convexTest(schema, modules);
    const categoryId = await seedCategory(t);
    await t.withIdentity(alice).mutation(api.users.ensureCurrent, {});
    const bobId = await t.withIdentity(bob).mutation(api.users.ensureCurrent, {});
    // args has no ownerId, so Convex rejects the extra field before the handler runs.
    await expect(
      t
        .withIdentity(alice)
        .mutation(api.tools.create, { ...drill(categoryId), ownerId: bobId } as never),
    ).rejects.toThrow();
  });

  test("rejects a blank name", async () => {
    const t = convexTest(schema, modules);
    const categoryId = await seedCategory(t);
    await t.withIdentity(alice).mutation(api.users.ensureCurrent, {});
    await expectAppError(
      t.withIdentity(alice).mutation(api.tools.create, { ...drill(categoryId), name: "   " }),
      "INVALID_INPUT",
    );
  });

  test("rejects a deactivated category", async () => {
    const t = convexTest(schema, modules);
    const categoryId = await seedCategory(t);
    await t.withIdentity(alice).mutation(api.users.ensureCurrent, {});
    await t.run((ctx) => ctx.db.patch("categories", categoryId, { isActive: false }));
    await expectAppError(
      t.withIdentity(alice).mutation(api.tools.create, drill(categoryId)),
      "INVALID_INPUT",
    );
  });
});

describe("listPublic", () => {
  test("returns only name and category label, even when signed out", async () => {
    const t = convexTest(schema, modules);
    await setup(t);
    const result = await t.query(api.tools.listPublic, firstPage);
    expect(result.page).toEqual([{ name: "Cordless drill", category: "Power tools" }]);
  });

  test("hides removed tools", async () => {
    const t = convexTest(schema, modules);
    const { toolId } = await setup(t);
    await t.withIdentity(alice).mutation(api.tools.remove, { toolId });
    const result = await t.query(api.tools.listPublic, firstPage);
    expect(result.page).toEqual([]);
  });
});

describe("browse", () => {
  test("requires sign-in, filters by category and flags the caller's own tools", async () => {
    const t = convexTest(schema, modules);
    const { categoryId } = await setup(t);
    const gardenId = await seedCategory(t, "garden");
    await t
      .withIdentity(bob)
      .mutation(api.tools.create, { ...drill(gardenId), name: "Hedge trimmer" });

    await expectAppError(t.query(api.tools.browse, firstPage), "UNAUTHENTICATED");

    const all = await t.withIdentity(alice).query(api.tools.browse, firstPage);
    const power = await t.withIdentity(alice).query(api.tools.browse, { ...firstPage, categoryId });
    expect(all.page.map((tool) => [tool.name, tool.isMine])).toEqual([
      ["Hedge trimmer", false],
      ["Cordless drill", true],
    ]);
    expect(power.page.map((tool) => tool.name)).toEqual(["Cordless drill"]);
    expect(power.page[0]).toMatchObject({ ownerName: "Alice", categoryLabel: "Power tools" });
  });
});

describe("listMine", () => {
  test("returns only the caller's tools", async () => {
    const t = convexTest(schema, modules);
    const { categoryId } = await setup(t);
    await t.withIdentity(bob).mutation(api.tools.create, { ...drill(categoryId), name: "Ladder" });

    const mine = await t.withIdentity(alice).query(api.tools.listMine, {});
    expect(mine.map((tool) => tool.name)).toEqual(["Cordless drill"]);
    expect(mine[0].categoryLabel).toBe("Power tools");
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
