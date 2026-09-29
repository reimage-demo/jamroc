import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
const http = httpRouter();
http.route({
  path: "/toast/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (
      process.env.TOAST_ENABLED !== "true" ||
      !process.env.TOAST_WEBHOOK_SECRET
    )
      return new Response("Toast integration is not enabled", { status: 503 });
    if (Number(request.headers.get("content-length")) > 1024 * 1024)
      return new Response("Payload too large", { status: 413 });
    const body = await request.text();
    if (new TextEncoder().encode(body).length > 1024 * 1024)
      return new Response("Payload too large", { status: 413 });
    let event: any;
    try {
      event = JSON.parse(body);
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }
    if (
      typeof event.timestamp !== "string" ||
      !Number.isFinite(Date.parse(event.timestamp))
    )
      return new Response("Invalid timestamp", { status: 400 });
    const signature = request.headers.get("Toast-Signature") || "";
    try {
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(process.env.TOAST_WEBHOOK_SECRET),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["verify"],
      );
      const valid = await crypto.subtle.verify(
        "HMAC",
        key,
        Uint8Array.from(atob(signature), (c) => c.charCodeAt(0)),
        new TextEncoder().encode(body + event.timestamp),
      );
      if (!valid) return new Response("Invalid signature", { status: 401 });
    } catch {
      return new Response("Invalid signature", { status: 401 });
    }
    // Signed event IDs are deduplicated durably. Old signed retries remain valid.
    if (event.details?.restaurantGuid !== process.env.TOAST_RESTAURANT_GUID)
      return new Response("Wrong restaurant", { status: 403 });
    if (!["order_updated", "channel_order_updated"].includes(event.eventType))
      return new Response("Ignored", { status: 200 });
    const guidPattern = /^[0-9a-f-]{36}$/i;
    if (
      !guidPattern.test(event.guid) ||
      !guidPattern.test(event.details?.order?.guid)
    )
      return new Response("Invalid event", { status: 400 });
    await ctx.runMutation(internal.webhooks.enqueue, {
      eventId: event.guid,
      orderGuid: event.details.order.guid,
    });
    return new Response("Accepted", { status: 200 });
  }),
});
export default http;
