"use node";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { randomBytes } from "node:crypto";
import { passwordHash, matches, tokenHash } from "./lib/crypto";
export const login = action({
  args: { username: v.string(), password: v.string() },
  handler: async (ctx, { username, password }): Promise<any> => {
    username = username.trim().toLowerCase();
    if (!/^[a-z0-9_-]{3,40}$/.test(username) || password.length > 128)
      return { error: "Invalid username or password." };
    if (!(await ctx.runMutation(internal.auth.reserveAttempt, { username })))
      return { error: "Account locked. Contact your administrator." };
    const user = await ctx.runQuery(internal.auth.credentials, { username });
    const pepper = process.env.AUTH_PEPPER;
    if (!pepper) throw new Error("Sign-in is not configured yet.");
    const hash = passwordHash(password, user?.salt ?? "0".repeat(32), pepper);
    if (!user?.active || !matches(hash, user.hash))
      return {
        error:
          "Invalid username or password. Five failed attempts lock the account.",
      };
    const token = randomBytes(32).toString("hex");
    await ctx.runMutation(internal.auth.startSession, {
      userId: user._id,
      expectedHash: user.hash,
      tokenHash: tokenHash(token),
    });
    return { token, username: user.username, role: user.role };
  },
});
export const bootstrap = internalAction({
  args: {},
  handler: async (ctx): Promise<void> => {
    const username = process.env.ADMIN_USERNAME,
      hash = process.env.ADMIN_PASSWORD_HASH,
      salt = process.env.ADMIN_PASSWORD_SALT;
    if (
      !username ||
      !hash ||
      !salt ||
      !process.env.AUTH_PEPPER ||
      !process.env.CUSTOMER_ENCRYPTION_KEY_V1
    )
      throw new Error("Set server security environment first");
    await ctx.runMutation(internal.auth.saveUser, {
      username,
      hash,
      salt,
      role: "admin",
    });
  },
});
export const saveEmployee = action({
  args: { token: v.string(), username: v.string(), password: v.string() },
  handler: async (ctx, { token, username, password }): Promise<void> => {
    await ctx.runQuery(internal.auth.staff, { token, admin: true });
    username = username.trim().toLowerCase();
    if (
      !/^[a-z0-9_-]{3,40}$/.test(username) ||
      password.length < 12 ||
      password.length > 128
    )
      throw new Error(
        "Use a username of 3–40 letters/numbers and a password of 12–128 characters.",
      );
    const salt = randomBytes(16).toString("hex");
    const hash = passwordHash(password, salt, process.env.AUTH_PEPPER!);
    await ctx.runMutation(internal.auth.saveUser, {
      username,
      salt,
      hash,
      role: "employee",
      actorToken: token,
    });
  },
});
