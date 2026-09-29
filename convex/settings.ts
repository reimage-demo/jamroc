import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireStaff } from "./auth";
const fields = {
  phone: v.string(),
  address: v.string(),
  hours: v.string(),
  email: v.string(),
  instagram: v.string(),
  toastOrderingUrl: v.string(),
  orderingEnabled: v.boolean(),
};
export function validToastUrl(value: string) {
  try {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      (u.hostname === "toasttab.com" || u.hostname.endsWith(".toasttab.com"))
    );
  } catch {
    return false;
  }
}
export const publicSettings = query({
  args: {},
  handler: async (ctx) => {
    const s = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "site"))
      .unique();
    if (!s) return null;
    const { phone, address, hours, email, instagram, toastOrderingUrl } = s;
    return {
      phone,
      address,
      hours,
      email,
      instagram,
      toastOrderingUrl,
      orderingEnabled:
        s.orderingEnabled &&
        process.env.TOAST_ENABLED === "true" &&
        process.env.MENU_PREVIEW_ENABLED !== "true",
    };
  },
});
export const adminSettings = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await requireStaff(ctx, token, true);
    return {
      settings: await ctx.db
        .query("settings")
        .withIndex("by_key", (q) => q.eq("key", "site"))
        .unique(),
      toastConnected: process.env.TOAST_ENABLED === "true",
      recentWebhookEvents: await ctx.db
        .query("webhookEvents")
        .order("desc")
        .take(10),
    };
  },
});
export const save = mutation({
  args: { token: v.string(), ...fields },
  handler: async (ctx, { token, ...data }) => {
    await requireStaff(ctx, token, true);
    for (const val of Object.values(data))
      if (typeof val === "string" && val.length > 2000)
        throw new Error("Setting too long");
    if (data.toastOrderingUrl && !validToastUrl(data.toastOrderingUrl))
      throw new Error("Use a valid HTTPS Toast ordering URL");
    if (
      data.orderingEnabled &&
      (!data.toastOrderingUrl ||
        process.env.TOAST_ENABLED !== "true" ||
        process.env.MENU_PREVIEW_ENABLED === "true")
    )
      throw new Error("Connect and verify Toast before enabling ordering");
    if (
      data.instagram &&
      !/^https:\/\/(www\.)?instagram\.com\//.test(data.instagram)
    )
      throw new Error("Use an Instagram HTTPS link");
    const s = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "site"))
      .unique();
    if (s) await ctx.db.patch(s._id, { ...data, updatedAt: Date.now() });
    else
      await ctx.db.insert("settings", {
        key: "site",
        ...data,
        updatedAt: Date.now(),
      });
  },
});
