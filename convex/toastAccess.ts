import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
// One shared schedule keeps this location below Toast's 20 req/sec default.
export async function reserveRequest(ctx: any, earliest: number) {
  const row = await ctx.db
    .query("toastAccess")
    .withIndex("by_key", (q: any) => q.eq("key", "toast"))
    .unique();
  const at = Math.max(
    Date.now(),
    earliest,
    row?.nextRequestAt || 0,
    row?.pausedUntil || 0,
  );
  if (row) await ctx.db.patch(row._id, { nextRequestAt: at + 250 });
  else
    await ctx.db.insert("toastAccess", {
      key: "toast",
      nextRequestAt: at + 250,
    });
  return at;
}
export const acquireToken = internalMutation({
  args: { owner: v.string() },
  handler: async (ctx, { owner }) => {
    const row = await ctx.db
      .query("toastAccess")
      .withIndex("by_key", (q) => q.eq("key", "toast"))
      .unique();
    const now = Date.now();
    if ((row?.pausedUntil || 0) > now)
      return { kind: "wait" as const, delay: row!.pausedUntil! - now };
    if (row?.tokenCipher && (row.expiresAt || 0) > now + 60000)
      return { kind: "cached" as const, cipher: row.tokenCipher };
    if (row?.refreshOwner && (row.refreshUntil || 0) > now)
      return { kind: "wait" as const, delay: 2000 };
    // Failed authentication must not cause a per-order retry storm.
    if (row?.lastRefreshAt && now - row.lastRefreshAt < 30 * 60 * 1000)
      return {
        kind: "wait" as const,
        delay: 30 * 60 * 1000 - (now - row.lastRefreshAt),
      };
    const patch = {
      refreshOwner: owner,
      refreshUntil: now + 30000,
      lastRefreshAt: now,
    };
    if (row) await ctx.db.patch(row._id, patch);
    else
      await ctx.db.insert("toastAccess", {
        key: "toast",
        nextRequestAt: now,
        ...patch,
      });
    return { kind: "refresh" as const };
  },
});
export const saveToken = internalMutation({
  args: { owner: v.string(), cipher: v.string(), expiresAt: v.number() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("toastAccess")
      .withIndex("by_key", (q) => q.eq("key", "toast"))
      .unique();
    if (!row || row.refreshOwner !== args.owner)
      throw new Error("Token refresh lease expired");
    await ctx.db.patch(row._id, {
      tokenCipher: args.cipher,
      expiresAt: args.expiresAt,
      refreshOwner: undefined,
      refreshUntil: undefined,
    });
  },
});
export const invalidateToken = internalMutation({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db
      .query("toastAccess")
      .withIndex("by_key", (q) => q.eq("key", "toast"))
      .unique();
    if (row)
      await ctx.db.patch(row._id, {
        tokenCipher: undefined,
        expiresAt: undefined,
      });
  },
});

export const pause = internalMutation({
  args: { delay: v.number() },
  handler: async (ctx, { delay }) => {
    const row = await ctx.db
      .query("toastAccess")
      .withIndex("by_key", (q) => q.eq("key", "toast"))
      .unique();
    if (row)
      await ctx.db.patch(row._id, {
        pausedUntil: Math.max(row.pausedUntil || 0, Date.now() + delay),
      });
  },
});
