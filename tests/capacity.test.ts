import { it, expect, vi, afterEach } from "vitest";
import { convexTest } from "convex-test";
import { randomBytes, randomUUID } from "node:crypto";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { encryptCustomer, tokenHash } from "../convex/lib/crypto";
const modules = import.meta.glob("../convex/**/*.ts");
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("imports a 50-order burst with one shared Toast token and no duplicate orders", async () => {
  vi.useFakeTimers();
  const key = randomBytes(32).toString("hex");
  for (const [name, value] of Object.entries({
    TOAST_ENABLED: "true",
    TOAST_CLIENT_ID: "test",
    TOAST_CLIENT_SECRET: "test",
    TOAST_RESTAURANT_GUID: "restaurant",
    TOAST_PICKUP_DINING_OPTION_GUIDS: "pickup",
    CUSTOMER_ENCRYPTION_KEY_V1: key,
  }))
    vi.stubEnv(name, value);
  let authCalls = 0,
    orderCalls = 0;
  const timestamp = new Date().toISOString();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.endsWith("/authentication/login")) {
        authCalls++;
        return Response.json({
          token: { accessToken: "test-token", expiresIn: 86400 },
        });
      }
      orderCalls++;
      const id = url.split("/").pop();
      return Response.json({
        guid: id,
        source: "Online",
        diningOption: { guid: "pickup" },
        approvalStatus: "APPROVED",
        displayNumber: id,
        createdDate: timestamp,
        modifiedDate: timestamp,
        checks: [
          {
            paymentStatus: "PAID",
            customer: { firstName: "Guest" },
            selections: [{ displayName: "Jerk Chicken", quantity: 1 }],
            payments: [{ paymentStatus: "CAPTURED" }],
          },
        ],
      });
    }),
  );
  const t = convexTest(schema, modules);
  const events = Array.from({ length: 50 }, () => ({
    eventId: randomUUID(),
    orderGuid: randomUUID(),
  }));
  await Promise.all(
    events.map((e) => t.mutation(internal.webhooks.enqueue, e)),
  );
  await Promise.all(
    events.map((e) => t.mutation(internal.webhooks.enqueue, e)),
  );
  const jobs = await t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect(),
  );
  expect(jobs).toHaveLength(50);
  const times = jobs.map((j) => j.scheduledTime).sort((a, b) => a - b);
  for (let i = 1; i < times.length; i++)
    expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(250);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(authCalls).toBe(1);
  expect(orderCalls).toBe(50);
  expect(await t.query(api.orders.board, {})).toHaveLength(50);
  expect(
    (await t.run((ctx) => ctx.db.query("webhookEvents").collect())).every(
      (e) => e.state === "processed",
    ),
  ).toBe(true);
}, 20000);
it("keeps all 50 active orders visible behind 250 newer historical orders and handles 50 staff updates", async () => {
  const t = convexTest(schema, modules);
  const now = Date.now(),
    key = randomBytes(32).toString("hex"),
    token = randomBytes(32).toString("hex");
  vi.stubEnv("CUSTOMER_ENCRYPTION_KEY_V1", key);
  await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      username: "capacity-test",
      role: "employee",
      salt: "a".repeat(32),
      hash: "test",
      active: true,
      createdAt: now,
    });
    await ctx.db.insert("sessions", {
      userId,
      tokenHash: tokenHash(token),
      expiresAt: now + 60000,
    });
    for (let i = 0; i < 250; i++)
      await ctx.db.insert("orders", {
        toastGuid: "history-" + i,
        orderNumber: "H" + i,
        customerCipher: "unused",
        items: [],
        status: "collected",
        paymentState: "paid",
        source: "toast",
        createdAt: now + i,
        updatedAt: now,
        toastUpdatedAt: now,
      });
  });
  const burst = Array.from({ length: 50 }, (_, i) => ({
    toastGuid: "burst-" + i,
    orderNumber: String(i),
    customerCipher: encryptCustomer({ firstName: "Customer" + i }, key),
    items: [{ name: "Oxtail", quantity: 1 }],
    paymentState: "paid" as const,
    createdAt: now - 1000,
    toastUpdatedAt: now,
  }));
  await Promise.all(
    burst.map((o) => t.mutation(internal.orders.upsertToast, o)),
  );
  const board = await t.query(api.orders.board, {});
  expect(board).toHaveLength(50);
  expect(
    (await t.query(api.orders.staffList, { token })).filter(
      (o) => o.status === "preparing",
    ),
  ).toHaveLength(50);
  const names = await t.action(api.customerData.boardNames, {});
  expect(names).toHaveLength(50);
  await Promise.all(
    board.map((o) =>
      t.mutation(api.orders.changeStatus, {
        token,
        id: o._id,
        status: "ready",
      }),
    ),
  );
  const readers = await Promise.all(
    Array.from({ length: 50 }, () => t.query(api.orders.board, {})),
  );
  expect(
    readers.every(
      (rows) => rows.length === 50 && rows.every((o) => o.status === "ready"),
    ),
  ).toBe(true);
  await Promise.all(
    board.map((o) =>
      t.mutation(api.orders.changeStatus, {
        token,
        id: o._id,
        status: "collected",
      }),
    ),
  );
  expect(await t.query(api.orders.board, {})).toHaveLength(0);
  expect(
    await t.run(
      async (ctx) => (await ctx.db.query("orderEvents").collect()).length,
    ),
  ).toBe(100);
});
it("honors a shared Toast cooldown and allows only one token refresh owner", async () => {
  const t = convexTest(schema, modules);
  const first = await t.mutation(internal.toastAccess.acquireToken, {
    owner: "first",
  });
  expect(first.kind).toBe("refresh");
  const requests = await Promise.all(
    Array.from({ length: 50 }, (_, i) =>
      t.mutation(internal.toastAccess.acquireToken, { owner: String(i) }),
    ),
  );
  expect(requests.every((r) => r.kind === "wait")).toBe(true);
  await t.mutation(internal.toastAccess.saveToken, {
    owner: "first",
    cipher: "encrypted",
    expiresAt: Date.now() + 86400000,
  });
  expect(
    (await t.mutation(internal.toastAccess.acquireToken, { owner: "second" }))
      .kind,
  ).toBe("cached");
  await t.mutation(internal.toastAccess.pause, { delay: 60000 });
  const blocked = await t.mutation(internal.toastAccess.acquireToken, {
    owner: "third",
  });
  expect(blocked.kind).toBe("wait");
});
