"use node";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { decryptCustomer } from "./lib/crypto";
export const boardNames = action({
  args: {},
  handler: async (ctx): Promise<any> => {
    const rows = await ctx.runQuery(internal.orders.boardInternal, {});
    return rows.map((o: any) => {
      const customer = decryptCustomer(
        o.customerCipher,
        process.env.CUSTOMER_ENCRYPTION_KEY_V1!,
      );
      return {
        id: o._id,
        firstName: String(customer.firstName || "Guest")
          .trim()
          .split(/\s+/)[0]
          .slice(0, 40),
      };
    });
  },
});
export const detail = action({
  args: { token: v.string(), id: v.id("orders") },
  handler: async (ctx, args): Promise<any> => {
    const o = await ctx.runQuery(internal.orders.detailInternal, args);
    if (!o) throw new Error("Order not found");
    const customer = decryptCustomer(
      o.customerCipher,
      process.env.CUSTOMER_ENCRYPTION_KEY_V1!,
    );
    return {
      firstName: customer.firstName || "Guest",
      notes: customer.notes || "",
    };
  },
});
