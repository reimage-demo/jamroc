"use node";
import { internalAction, action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { encryptCustomer } from "./lib/crypto";
import { normalizeToastOrder } from "./lib/toastOrder";
export const importOrder = internalAction({
  args: { id: v.id("webhookEvents") },
  handler: async (ctx, { id }): Promise<void> => {
    const event = await ctx.runQuery(internal.webhooks.get, { id });
    if (!event || event.state === "processed") return;
    try {
      if (process.env.TOAST_ENABLED !== "true") throw new Error("Disabled");
      const base =
        process.env.TOAST_API_BASE_URL || "https://ws-api.toasttab.com";
      if (
        ![
          "https://ws-api.toasttab.com",
          "https://ws-sandbox-api.eng.toasttab.com",
        ].includes(base)
      )
        throw new Error("Invalid API host");
      const clientId = process.env.TOAST_CLIENT_ID,
        clientSecret = process.env.TOAST_CLIENT_SECRET,
        restaurant = process.env.TOAST_RESTAURANT_GUID;
      if (
        !clientId ||
        !clientSecret ||
        !restaurant ||
        !process.env.TOAST_PICKUP_DINING_OPTION_GUIDS
      )
        throw new Error("Incomplete configuration");
      const response = await fetch(base + "/authentication/v1/authentication", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          clientSecret,
          userAccessType: "TOAST_MACHINE_CLIENT",
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error("Toast authentication failed");
      const auth = await response.json();
      if (!auth.token?.accessToken) throw new Error("Token missing");
      const fetched = await fetch(
        base + "/orders/v2/orders/" + encodeURIComponent(event.orderGuid),
        {
          headers: {
            Authorization: "Bearer " + auth.token.accessToken,
            "Toast-Restaurant-External-ID": restaurant,
          },
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!fetched.ok) throw new Error("Toast order unavailable");
      const order = await fetched.json();
      if (order.guid !== event.orderGuid) throw new Error("Unexpected order");
      const normalized = normalizeToastOrder(
        order,
        (process.env.TOAST_ORDER_SOURCES || "Online,Branded Online Ordering")
          .split(",")
          .map((s) => s.trim()),
        process.env.TOAST_PICKUP_DINING_OPTION_GUIDS.split(",").map((s) =>
          s.trim(),
        ),
      );
      if (normalized) {
        const { customer, ...data } = normalized;
        const customerCipher = encryptCustomer(
          customer,
          process.env.CUSTOMER_ENCRYPTION_KEY_V1!,
        );
        await ctx.runMutation(internal.orders.upsertToast, {
          ...data,
          customerCipher,
        });
      }
      await ctx.runMutation(internal.webhooks.finish, { id, success: true });
    } catch {
      await ctx.runMutation(internal.webhooks.finish, { id, success: false });
    }
  },
});
export const retryImport = action({
  args: { token: v.string(), id: v.id("webhookEvents") },
  handler: async (ctx, { token, id }): Promise<void> => {
    await ctx.runQuery(internal.auth.staff, { token, admin: true });
    await ctx.runAction(internal.toast.importOrder, { id });
  },
});
