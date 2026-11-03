import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { ensureDefaultCategories } from "./lib/categories";
import { addDays, toIsoDate } from "./lib/dates";
import { appError } from "./lib/errors";
import type { ToolCondition } from "./lib/toolFields";

// Development-only sample data. Internal mutations, so browsers cannot call them, and
// they refuse to run unless the deployment has LENDLOOP_ALLOW_SEED=true.

// Seed users get this token prefix. Real Clerk tokens start with "https://", so the
// two can never collide, and clearing the seed never touches a real account.
const SEED_TOKEN_PREFIX = "seed|";

const SEED_USERS = [
  { key: "priya", name: "Priya Shah", trusted: true },
  { key: "marcus", name: "Marcus Lee", trusted: false },
  { key: "lena", name: "Lena Novak", trusted: true },
  { key: "tom", name: "Tom Okafor", trusted: false },
] as const;

type SeedUserKey = (typeof SEED_USERS)[number]["key"];

const SEED_TOOLS: {
  owner: SeedUserKey;
  name: string;
  category: string;
  condition: ToolCondition;
  description: string;
}[] = [
  {
    owner: "priya",
    name: "Cordless drill",
    category: "power-tools",
    condition: "good",
    description: "18V, two batteries and a bit set.",
  },
  {
    owner: "priya",
    name: "Extension ladder",
    category: "ladders",
    condition: "fair",
    description: "Reaches 6 m. Heavy, bring a friend.",
  },
  {
    owner: "priya",
    name: "Pressure washer",
    category: "cleaning",
    condition: "new",
    description: "Great for patios and bikes.",
  },
  {
    owner: "marcus",
    name: "Circular saw",
    category: "power-tools",
    condition: "good",
    description: "Comes with a spare blade.",
  },
  {
    owner: "marcus",
    name: "Camping stove",
    category: "camping",
    condition: "worn",
    description: "Works fine, looks well loved.",
  },
  {
    owner: "lena",
    name: "Hedge trimmer",
    category: "garden",
    condition: "good",
    description: "Electric, 10 m cable.",
  },
  {
    owner: "lena",
    name: "Stand mixer",
    category: "kitchen",
    condition: "new",
    description: "With dough hook and whisk.",
  },
  {
    owner: "lena",
    name: "Socket set",
    category: "hand-tools",
    condition: "good",
    description: "Metric, 40 pieces.",
  },
  {
    owner: "tom",
    name: "Two-person tent",
    category: "camping",
    condition: "fair",
    description: "Packs small. One pole is taped.",
  },
  {
    owner: "tom",
    name: "Lawn mower",
    category: "garden",
    condition: "good",
    description: "Petrol. Fuel not included.",
  },
];

function requireSeedingAllowed() {
  if (process.env.LENDLOOP_ALLOW_SEED !== "true") {
    throw appError(
      "FORBIDDEN",
      "Seeding is disabled. Set LENDLOOP_ALLOW_SEED=true on a development deployment only.",
    );
  }
}

async function seedUsers(ctx: MutationCtx): Promise<Doc<"users">[]> {
  return await ctx.db
    .query("users")
    .withIndex("by_token_identifier", (q) =>
      q.gte("tokenIdentifier", SEED_TOKEN_PREFIX).lt("tokenIdentifier", "seed}"),
    )
    .collect();
}

/** Deletes every seed user with their tools and every loan they are part of. */
async function clearSeedData(ctx: MutationCtx) {
  let loans = 0;
  let tools = 0;
  const users = await seedUsers(ctx);
  for (const user of users) {
    const asBorrower = await ctx.db
      .query("loans")
      .withIndex("by_borrower", (q) => q.eq("borrowerId", user._id))
      .collect();
    const asLender = await ctx.db
      .query("loans")
      .withIndex("by_lender", (q) => q.eq("lenderId", user._id))
      .collect();
    for (const loan of [...asBorrower, ...asLender]) {
      // A loan between two seed users appears in both lists; delete it once.
      if ((await ctx.db.get("loans", loan._id)) !== null) {
        const events = await ctx.db
          .query("outboundEvents")
          .withIndex("by_loan", (q) => q.eq("loanId", loan._id))
          .collect();
        for (const event of events) {
          await ctx.db.delete("outboundEvents", event._id);
        }
        const entries = await ctx.db
          .query("activity")
          .withIndex("by_loan", (q) => q.eq("loanId", loan._id))
          .collect();
        for (const entry of entries) {
          await ctx.db.delete("activity", entry._id);
        }
        await ctx.db.delete("loans", loan._id);
        loans++;
      }
    }
    const owned = await ctx.db
      .query("tools")
      .withIndex("by_owner_and_status", (q) => q.eq("ownerId", user._id))
      .collect();
    for (const tool of owned) {
      await ctx.db.delete("tools", tool._id);
      tools++;
    }
    await ctx.db.delete("users", user._id);
  }
  return { users: users.length, tools, loans };
}

const countsValidator = v.object({ users: v.number(), tools: v.number(), loans: v.number() });

/** Removes all seed data. Run with: npm run seed:clear */
export const clear = internalMutation({
  args: {},
  returns: countsValidator,
  handler: async (ctx) => {
    requireSeedingAllowed();
    return await clearSeedData(ctx);
  },
});

/**
 * Replaces the seed data with a fresh set: 4 users, 10 tools and loans in every
 * state, dated around today. Every real (signed-up) user also gets requests from
 * seed users on their own tools, and requests of their own on seed tools, so all
 * pages have something to show. Run with: npm run seed
 */
export const run = internalMutation({
  args: {},
  returns: countsValidator,
  handler: async (ctx) => {
    requireSeedingAllowed();
    await clearSeedData(ctx);
    await ensureDefaultCategories(ctx);

    const today = toIsoDate(Date.now());
    const day = (offset: number) => addDays(today, offset);
    const now = Date.now();

    const users = {} as Record<SeedUserKey, Id<"users">>;
    for (const user of SEED_USERS) {
      users[user.key] = await ctx.db.insert("users", {
        tokenIdentifier: `${SEED_TOKEN_PREFIX}${user.key}`,
        // .test is a reserved domain, so automated emails can never reach a real inbox.
        email: `${user.key}@seed.lendloop.test`,
        displayName: user.name,
        role: "user",
        isTrustedLender: user.trusted,
      });
    }

    const categories = await ctx.db.query("categories").collect();
    const categoryIdBySlug = new Map(categories.map((c) => [c.slug, c._id]));
    const tools: Id<"tools">[] = [];
    for (const tool of SEED_TOOLS) {
      tools.push(
        await ctx.db.insert("tools", {
          ownerId: users[tool.owner],
          name: tool.name,
          categoryId: categoryIdBySlug.get(tool.category)!,
          condition: tool.condition,
          description: tool.description,
          status: "active",
        }),
      );
    }

    let loansCreated = 0;
    const loan = async (
      toolIndex: number,
      borrower: Id<"users">,
      start: number,
      end: number,
      status: Doc<"loans">["status"],
      extra: Partial<Doc<"loans">> = {},
    ) => {
      const tool = (await ctx.db.get("tools", tools[toolIndex]))!;
      await ctx.db.insert("loans", {
        toolId: tool._id,
        lenderId: tool.ownerId,
        borrowerId: borrower,
        startDate: day(start),
        endDate: day(end),
        status,
        ...(status === "pending" ? {} : { decidedAt: now }),
        ...extra,
      });
      loansCreated++;
    };

    // Between seed users: one of every state, plus an overdue loan for the reminders.
    await loan(0, users.marcus, -20, -15, "returned", { returnedAt: now });
    await loan(0, users.lena, -2, 3, "approved");
    await loan(3, users.tom, -10, -3, "approved"); // overdue: ended 3 days ago, not returned
    await loan(5, users.priya, 5, 7, "pending");
    await loan(5, users.tom, 6, 8, "pending"); // overlaps the one above
    await loan(6, users.marcus, 2, 4, "declined");
    await loan(8, users.lena, 10, 12, "cancelled");
    await loan(9, users.priya, 1, 2, "declined", { declineReason: "conflict" });

    // Real users: give their pages something to show.
    const realUsers = (await ctx.db.query("users").collect()).filter(
      (u) => !u.tokenIdentifier.startsWith(SEED_TOKEN_PREFIX),
    );
    for (const [index, real] of realUsers.entries()) {
      // Each real user gets their own dates, so their approved loans never overlap.
      const shift = index * 4;
      await loan(1, real._id, 4 + shift, 6 + shift, "pending");
      await loan(4, real._id, 8 + shift, 10 + shift, "approved");
      await loan(7, real._id, -14 - shift, -12 - shift, "returned", { returnedAt: now });

      const ownTool = await ctx.db
        .query("tools")
        .withIndex("by_owner_and_status", (q) => q.eq("ownerId", real._id).eq("status", "active"))
        .first();
      if (ownTool !== null) {
        for (const [borrower, start, end] of [
          [users.priya, 3, 5],
          [users.tom, 4, 6],
        ] as const) {
          await ctx.db.insert("loans", {
            toolId: ownTool._id,
            lenderId: real._id,
            borrowerId: borrower,
            startDate: day(start),
            endDate: day(end),
            status: "pending",
          });
          loansCreated++;
        }
      }
    }

    return { users: SEED_USERS.length, tools: SEED_TOOLS.length, loans: loansCreated };
  },
});
