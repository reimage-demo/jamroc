import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
export const enqueue = internalMutation({
  args: { eventId: v.string(), orderGuid: v.string() },
  handler: async (ctx, args) => {
    if (
      await ctx.db
        .query("webhookEvents")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
        .unique()
    )
      return;
    const id = await ctx.db.insert("webhookEvents", {
      ...args,
      state: "pending",
      attempts: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.toast.importOrder, { id });
  },
});
export const get = internalQuery({
  args: { id: v.id("webhookEvents") },
  handler: async (ctx, { id }) => ctx.db.get(id),
});
export const finish = internalMutation({
  args: { id: v.id("webhookEvents"), success: v.boolean() },
  handler: async (ctx, { id, success }) => {
    const event = await ctx.db.get(id);
    if (!event || event.state === "processed") return;
    const attempts = event.attempts + 1;
    await ctx.db.patch(id, {
      state: success ? "processed" : attempts >= 5 ? "failed" : "pending",
      attempts,
      updatedAt: Date.now(),
      lastError: success
        ? undefined
        : "Toast import failed. Check credentials, permissions, and connection.",
    });
    if (!success && attempts < 5)
      await ctx.scheduler.runAfter(
        Math.min(300000, 10000 * 2 ** attempts),
        internal.toast.importOrder,
        { id },
      );
  },
});
