import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { alice, bob, expectAppError, modules, seedCategory, type TestConvex } from "./test.setup";

/** Signs alice up as an admin and bob as a normal user. */
async function setupUsers(t: TestConvex) {
  await t.withIdentity(alice).mutation(api.users.ensureCurrent, {});
  await t.withIdentity(bob).mutation(api.users.ensureCurrent, {});
  await t.mutation(internal.users.promoteToAdmin, { email: alice.email });
}

describe("seed", () => {
  test("adds the defaults once and is safe to run again", async () => {
    const t = convexTest(schema, modules);
    expect(await t.mutation(internal.categories.seed, {})).toBe(8);
    expect(await t.mutation(internal.categories.seed, {})).toBe(0);
    const all = await t.run((ctx) => ctx.db.query("categories").collect());
    expect(all).toHaveLength(8);
  });
});

describe("listActive", () => {
  test("is public, sorted A to Z, and hides deactivated categories", async () => {
    const t = convexTest(schema, modules);
    const gardenId = await seedCategory(t, "garden");
    await t.run((ctx) => ctx.db.patch("categories", gardenId, { isActive: false }));

    const labels = (await t.query(api.categories.listActive, {})).map((c) => c.label);
    expect(labels).not.toContain("Garden");
    expect(labels).toEqual([...labels].sort());
  });
});

describe("admin management", () => {
  test("normal users cannot list all, create, rename or deactivate", async () => {
    const t = convexTest(schema, modules);
    const categoryId = await seedCategory(t);
    await setupUsers(t);
    const asBob = t.withIdentity(bob);

    await expectAppError(asBob.query(api.categories.listAll, {}), "FORBIDDEN");
    await expectAppError(asBob.mutation(api.categories.create, { label: "Boats" }), "FORBIDDEN");
    await expectAppError(
      asBob.mutation(api.categories.rename, { categoryId, label: "Drills" }),
      "FORBIDDEN",
    );
    await expectAppError(
      asBob.mutation(api.categories.setActive, { categoryId, isActive: false }),
      "FORBIDDEN",
    );
  });

  test("an admin can create a category with a derived slug", async () => {
    const t = convexTest(schema, modules);
    await setupUsers(t);
    const id = await t
      .withIdentity(alice)
      .mutation(api.categories.create, { label: "  Bikes & Scooters " });
    const category = await t.run((ctx) => ctx.db.get("categories", id));
    expect(category).toMatchObject({ label: "Bikes & Scooters", slug: "bikes-scooters" });
  });

  test("rejects a duplicate category", async () => {
    const t = convexTest(schema, modules);
    await seedCategory(t);
    await setupUsers(t);
    await expectAppError(
      t.withIdentity(alice).mutation(api.categories.create, { label: "garden" }),
      "INVALID_INPUT",
    );
  });

  test("renaming keeps the slug and updates what tools show", async () => {
    const t = convexTest(schema, modules);
    const categoryId = await seedCategory(t);
    await setupUsers(t);
    await t.withIdentity(bob).mutation(api.tools.create, {
      name: "Drill",
      categoryId,
      condition: "good",
      description: "",
    });

    await t
      .withIdentity(alice)
      .mutation(api.categories.rename, { categoryId, label: "Drills & drivers" });

    const category = await t.run((ctx) => ctx.db.get("categories", categoryId));
    const publicList = await t.query(api.tools.listPublic, {
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(category?.slug).toBe("power-tools");
    expect(publicList.page[0].category).toBe("Drills & drivers");
  });

  test("deactivating hides it from the form but existing tools keep it", async () => {
    const t = convexTest(schema, modules);
    const categoryId = await seedCategory(t);
    await setupUsers(t);
    await t.withIdentity(bob).mutation(api.tools.create, {
      name: "Drill",
      categoryId,
      condition: "good",
      description: "",
    });

    await t.withIdentity(alice).mutation(api.categories.setActive, { categoryId, isActive: false });

    const active = await t.query(api.categories.listActive, {});
    const mine = await t.withIdentity(bob).query(api.tools.listMine, {});
    expect(active.map((c) => c._id)).not.toContain(categoryId);
    expect(mine[0].categoryLabel).toBe("Power tools");
  });
});
