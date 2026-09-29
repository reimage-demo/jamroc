import {
  query,
  mutation,
  internalQuery,
  internalMutation,
} from "./_generated/server";
import { v } from "convex/values";
async function sha(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
export async function requireStaff(ctx: any, token: string, admin = false) {
  if (token.length < 32 || token.length > 256) throw new Error("UNAUTHORIZED");
  const hash = await sha(token);
  const session = await ctx.db
    .query("sessions")
    .withIndex("by_token", (q: any) => q.eq("tokenHash", hash))
    .unique();
  if (!session || session.expiresAt <= Date.now())
    throw new Error("UNAUTHORIZED");
  const user = await ctx.db.get(session.userId);
  if (!user?.active || (admin && user.role !== "admin"))
    throw new Error("UNAUTHORIZED");
  return user;
}
export const me = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    try {
      const u = await requireStaff(ctx, token);
      return { username: u.username, role: u.role };
    } catch {
      return null;
    }
  },
});
export const logout = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const hash = await sha(token);
    const s = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("tokenHash", hash))
      .unique();
    if (s) await ctx.db.delete(s._id);
  },
});
export const staff = internalQuery({
  args: { token: v.string(), admin: v.optional(v.boolean()) },
  handler: async (ctx, { token, admin }) => requireStaff(ctx, token, admin),
});
export const credentials = internalQuery({
  args: { username: v.string() },
  handler: async (ctx, { username }) =>
    ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique(),
});
// Reserve an attempt before password derivation so concurrent logins cannot bypass lockout.
export const reserveAttempt = internalMutation({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();
    const key = user ? username : "__unknown__";
    const row = await ctx.db
      .query("loginAttempts")
      .withIndex("by_username", (q) => q.eq("username", key))
      .unique();
    if (row?.locked && (user || Date.now() - row.updatedAt < 15 * 60 * 1000))
      return false;
    const failures = (row && !(row.locked && !user) ? row.failures : 0) + 1;
    const values = {
      username: key,
      failures,
      locked: failures >= 5,
      updatedAt: Date.now(),
    };
    if (row) await ctx.db.patch(row._id, values);
    else await ctx.db.insert("loginAttempts", values);
    return true;
  },
});
export const startSession = internalMutation({
  args: {
    userId: v.id("users"),
    tokenHash: v.string(),
    expectedHash: v.string(),
  },
  handler: async (ctx, args) => {
    const u = await ctx.db.get(args.userId);
    if (!u?.active || u.hash !== args.expectedHash)
      throw new Error("UNAUTHORIZED");
    const attempt = await ctx.db
      .query("loginAttempts")
      .withIndex("by_username", (q) => q.eq("username", u.username))
      .unique();
    if (attempt) await ctx.db.delete(attempt._id);
    await ctx.db.insert("sessions", {
      tokenHash: args.tokenHash,
      userId: u._id,
      expiresAt: Date.now() + 12 * 60 * 60 * 1000,
    });
  },
});
export const saveUser = internalMutation({
  args: {
    username: v.string(),
    hash: v.string(),
    salt: v.string(),
    role: v.union(v.literal("admin"), v.literal("employee")),
    actorToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.actorToken) await requireStaff(ctx, args.actorToken, true);
    else if (args.role !== "admin" || (await ctx.db.query("users").first()))
      throw new Error("Bootstrap already completed");
    const existing = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", args.username))
      .unique();
    if (existing && existing.role === "admin" && args.role === "employee")
      throw new Error("Cannot replace administrator");
    const values = {
      username: args.username,
      hash: args.hash,
      salt: args.salt,
      role: args.role,
      active: true,
      createdAt: Date.now(),
    };
    if (existing) {
      await ctx.db.patch(existing._id, values);
      const sessions = await ctx.db.query("sessions").collect();
      for (const s of sessions)
        if (s.userId === existing._id) await ctx.db.delete(s._id);
    } else await ctx.db.insert("users", values);
    const attempt = await ctx.db
      .query("loginAttempts")
      .withIndex("by_username", (q) => q.eq("username", args.username))
      .unique();
    if (attempt) await ctx.db.delete(attempt._id);
  },
});
export const listEmployees = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await requireStaff(ctx, token, true);
    return (await ctx.db.query("users").collect())
      .filter((u) => u.role === "employee")
      .map((u) => ({ _id: u._id, username: u.username, active: u.active }));
  },
});
export const deactivateEmployee = mutation({
  args: { token: v.string(), id: v.id("users") },
  handler: async (ctx, { token, id }) => {
    await requireStaff(ctx, token, true);
    const u = await ctx.db.get(id);
    if (u?.role !== "employee") throw new Error("Invalid employee");
    await ctx.db.patch(id, { active: false });
  },
});
export const unlock = internalMutation({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const a = await ctx.db
      .query("loginAttempts")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();
    if (a) await ctx.db.delete(a._id);
  },
});
