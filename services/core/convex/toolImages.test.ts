import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { alice, bob, expectAppError, modules, seedCategory, type TestConvex } from "./test.setup";

const firstPage = { paginationOpts: { numItems: 10, cursor: null } };

/** Stores a file the way a browser upload would, and returns its storage id. */
function upload(t: TestConvex, type = "image/png", bytes = 100) {
  return t.run((ctx) => ctx.storage.store(new Blob([new Uint8Array(bytes)], { type })));
}

/** Signs alice and bob up, and lists a drill as alice. */
async function setup(t: TestConvex) {
  const categoryId = await seedCategory(t);
  await t.withIdentity(alice).mutation(api.users.ensureCurrent, {});
  await t.withIdentity(bob).mutation(api.users.ensureCurrent, {});
  const toolId = await t.withIdentity(alice).mutation(api.tools.create, {
    name: "Cordless drill",
    categoryId,
    condition: "good",
    description: "",
  });
  return { toolId, categoryId };
}

describe("add", () => {
  test("shows photos to signed-in members but never on the public list", async () => {
    const t = convexTest(schema, modules);
    const { toolId } = await setup(t);
    const storageId = await upload(t);
    await t.withIdentity(alice).mutation(api.toolImages.add, { toolId, storageId });

    const browse = await t.withIdentity(bob).query(api.tools.browse, firstPage);
    const mine = await t.withIdentity(alice).query(api.tools.listMine, {});
    const publicList = await t.query(api.tools.listPublic, firstPage);
    expect(browse.page[0].images).toEqual([{ _id: expect.any(String), url: expect.any(String) }]);
    expect(mine[0].images).toHaveLength(1);
    expect(publicList.page[0]).toEqual({ name: "Cordless drill", category: "Power tools" });
  });

  test("only the owner can add photos", async () => {
    const t = convexTest(schema, modules);
    const { toolId } = await setup(t);
    const storageId = await upload(t);
    await expectAppError(
      t.withIdentity(bob).mutation(api.toolImages.add, { toolId, storageId }),
      "FORBIDDEN",
    );
  });

  test("rejects other file types and files that are too big", async () => {
    const t = convexTest(schema, modules);
    const { toolId } = await setup(t);
    const pdf = await upload(t, "application/pdf");
    const huge = await upload(t, "image/jpeg", 5 * 1024 * 1024 + 1);
    for (const storageId of [pdf, huge]) {
      await expectAppError(
        t.withIdentity(alice).mutation(api.toolImages.add, { toolId, storageId }),
        "INVALID_INPUT",
      );
    }
  });

  test("allows at most 6 photos per tool", async () => {
    const t = convexTest(schema, modules);
    const { toolId } = await setup(t);
    for (let i = 0; i < 6; i++) {
      const storageId = await upload(t);
      await t.withIdentity(alice).mutation(api.toolImages.add, { toolId, storageId });
    }
    const seventh = await upload(t);
    await expectAppError(
      t.withIdentity(alice).mutation(api.toolImages.add, { toolId, storageId: seventh }),
      "INVALID_INPUT",
    );
  });

  test("a photo already on a tool cannot be claimed by another tool", async () => {
    const t = convexTest(schema, modules);
    const { toolId, categoryId } = await setup(t);
    const storageId = await upload(t);
    await t.withIdentity(alice).mutation(api.toolImages.add, { toolId, storageId });
    const bobsTool = await t.withIdentity(bob).mutation(api.tools.create, {
      name: "Ladder",
      categoryId,
      condition: "good",
      description: "",
    });
    await expectAppError(
      t.withIdentity(bob).mutation(api.toolImages.add, { toolId: bobsTool, storageId }),
      "INVALID_INPUT",
    );
  });
});

describe("remove", () => {
  test("only the owner can remove a photo, and the file is deleted", async () => {
    const t = convexTest(schema, modules);
    const { toolId } = await setup(t);
    const storageId = await upload(t);
    const imageId = await t.withIdentity(alice).mutation(api.toolImages.add, { toolId, storageId });

    await expectAppError(
      t.withIdentity(bob).mutation(api.toolImages.remove, { imageId }),
      "FORBIDDEN",
    );
    await t.withIdentity(alice).mutation(api.toolImages.remove, { imageId });

    const mine = await t.withIdentity(alice).query(api.tools.listMine, {});
    expect(mine[0].images).toEqual([]);
    expect(await t.run((ctx) => ctx.storage.getUrl(storageId))).toBeNull();
  });
});

describe("deleteUnattached", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("deletes old uploads that were never attached, and keeps the rest", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-02T10:00:00Z"));
    const t = convexTest(schema, modules);
    const { toolId } = await setup(t);
    const attached = await upload(t);
    await t.withIdentity(alice).mutation(api.toolImages.add, { toolId, storageId: attached });
    const abandoned = await upload(t);

    vi.setSystemTime(new Date("2026-11-02T12:00:00Z"));
    const recent = await upload(t);
    const deleted = await t.mutation(internal.toolImages.deleteUnattached, {});

    expect(deleted).toBe(1);
    const urls = await t.run(async (ctx) => ({
      attached: await ctx.storage.getUrl(attached),
      abandoned: await ctx.storage.getUrl(abandoned),
      recent: await ctx.storage.getUrl(recent),
    }));
    expect(urls).toEqual({
      attached: expect.any(String),
      abandoned: null,
      recent: expect.any(String),
    });
  });
});
