import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const roleValidator = v.union(v.literal("user"), v.literal("admin"));

export default defineSchema({
  users: defineTable({
    // "<issuer>|<subject>" from the verified Clerk JWT. Never sent by the client.
    tokenIdentifier: v.string(),
    email: v.string(),
    displayName: v.string(),
    role: roleValidator,
    isTrustedLender: v.boolean(),
  })
    .index("by_token_identifier", ["tokenIdentifier"])
    .index("by_email", ["email"]),
});
