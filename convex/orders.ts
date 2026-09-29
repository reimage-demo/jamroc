import {
  query,
  mutation,
  internalQuery,
  internalMutation,
} from "./_generated/server";
import { v } from "convex/values";
import { requireStaff } from "./auth";
import { status } from "./schema";
export const transitions: Record<string, string[]> = {
  preparing: ["ready", "cancelled"],
  ready: ["preparing", "collected", "cancelled"],
  collected: [],
  cancelled: [],
};
export function publicOrder(o: any) {
  return {
    _id: o._id,
    orderNumber: o.orderNumber,
    status: o.status,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}
async function active(ctx: any) {
  const rows = await ctx.db
    .query("orders")
    .withIndex("by_created")
    .order("desc")
    .take(200);
  return rows.filter(
    (o: any) =>
      o.paymentState === "paid" &&
      ["preparing", "ready"].includes(o.status) &&
      o.createdAt > Date.now() - 24 * 60 * 60 * 1000,
  );
}
export const board = query({
  args: {},
  handler: async (ctx) => (await active(ctx)).map(publicOrder),
});
export const boardInternal = internalQuery({
  args: {},
  handler: async (ctx) => active(ctx),
});
export const staffList = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await requireStaff(ctx, token);
    return (
      await ctx.db
        .query("orders")
        .withIndex("by_created")
        .order("desc")
        .take(200)
    ).map((o) => ({
      ...publicOrder(o),
      items: o.items,
      paymentState: o.paymentState,
    }));
  },
});
export const detailInternal = internalQuery({
  args: { token: v.string(), id: v.id("orders") },
  handler: async (ctx, { token, id }) => {
    await requireStaff(ctx, token);
    return ctx.db.get(id);
  },
});
export const changeStatus = mutation({
  args: { token: v.string(), id: v.id("orders"), status },
  handler: async (ctx, { token, id, status: next }) => {
    const u = await requireStaff(ctx, token);
    const o = await ctx.db.get(id);
    if (!o) throw new Error("Order not found");
    if (o.status === next) return;
    if (o.paymentState !== "paid" || !transitions[o.status]?.includes(next))
      throw new Error("This order cannot move to that status");
    if (next === "cancelled" && u.role !== "admin")
      throw new Error("Only an administrator can cancel orders");
    await ctx.db.patch(id, {
      status: next,
      updatedAt: Date.now(),
      lastChangedBy: u._id,
    });
    await ctx.db.insert("orderEvents", {
      orderId: id,
      userId: u._id,
      from: o.status,
      to: next,
      createdAt: Date.now(),
    });
  },
});
export const upsertToast = internalMutation({
  args: {
    toastGuid: v.string(),
    orderNumber: v.string(),
    customerCipher: v.string(),
    items: v.array(v.object({ name: v.string(), quantity: v.number() })),
    paymentState: v.union(
      v.literal("paid"),
      v.literal("refunded"),
      v.literal("voided"),
    ),
    createdAt: v.number(),
    toastUpdatedAt: v.number(),
  },
  handler: async (ctx, data) => {
    const old = await ctx.db
      .query("orders")
      .withIndex("by_toast", (q) => q.eq("toastGuid", data.toastGuid))
      .unique();
    if (old && old.toastUpdatedAt >= data.toastUpdatedAt) return;
    const cancelled = data.paymentState !== "paid";
    if (old)
      await ctx.db.patch(old._id, {
        ...data,
        status: cancelled ? "cancelled" : old.status,
        updatedAt: Date.now(),
      });
    else if (!cancelled)
      await ctx.db.insert("orders", {
        ...data,
        source: "toast",
        status: "preparing",
        updatedAt: Date.now(),
      });
  },
});
