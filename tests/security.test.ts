import { describe, it, expect, vi } from "vitest";
import { randomBytes, createHmac } from "node:crypto";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import {
  encryptCustomer,
  decryptCustomer,
  passwordHash,
  matches,
  tokenHash,
} from "../convex/lib/crypto";
import { normalizeToastOrder } from "../convex/lib/toastOrder";
const modules = import.meta.glob("../convex/**/*.ts");
async function setup(role: "admin" | "employee" = "employee") {
  const t = convexTest(schema, modules);
  const token = randomBytes(32).toString("hex");
  const userId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("users", {
      username: "teststaff",
      role,
      salt: "a".repeat(32),
      hash: "hash",
      active: true,
      createdAt: Date.now(),
    });
    await ctx.db.insert("sessions", {
      tokenHash: tokenHash(token),
      userId: id,
      expiresAt: Date.now() + 60000,
    });
    return id;
  });
  return { t, token, userId };
}
const orderData = () => ({
  toastGuid: "a".repeat(36),
  orderNumber: "123",
  customerCipher: "secret",
  items: [{ name: "Jerk Chicken", quantity: 1 }],
  paymentState: "paid" as const,
  createdAt: Date.now(),
  toastUpdatedAt: Date.now(),
});
describe("customer encryption", () => {
  it("round-trips, uses unique nonces, and rejects tampering", () => {
    const key = randomBytes(32).toString("hex"),
      data = { firstName: "Alex", notes: "Private note" };
    const a = encryptCustomer(data, key),
      b = encryptCustomer(data, key);
    expect(a).not.toEqual(b);
    expect(a).not.toContain("Alex");
    expect(decryptCustomer(a, key)).toEqual(data);
    expect(() =>
      decryptCustomer(a.replace(/.$/, a.endsWith("0") ? "1" : "0"), key),
    ).toThrow();
    expect(() => decryptCustomer(a, randomBytes(32).toString("hex"))).toThrow();
  });
  it("uses salt and pepper for password hashing", () => {
    const h = passwordHash("example-password", "a".repeat(32), "pepper");
    expect(
      matches(h, passwordHash("example-password", "a".repeat(32), "pepper")),
    ).toBe(true);
    expect(
      matches(h, passwordHash("example-password", "b".repeat(32), "pepper")),
    ).toBe(false);
    expect(
      matches(h, passwordHash("example-password", "a".repeat(32), "different")),
    ).toBe(false);
  });
});
describe("roles and orders", () => {
  it("blocks employees from menu and settings and anonymous order reads", async () => {
    const { t, token } = await setup();
    await expect(t.query(api.menu.adminMenu, { token })).rejects.toThrow(
      "UNAUTHORIZED",
    );
    await expect(t.mutation(api.menu.uploadUrl, { token })).rejects.toThrow(
      "UNAUTHORIZED",
    );
    await expect(
      t.query(api.settings.adminSettings, { token }),
    ).rejects.toThrow("UNAUTHORIZED");
    await expect(
      t.query(api.orders.staffList, { token: "x".repeat(64) }),
    ).rejects.toThrow("UNAUTHORIZED");
  });
  it("allows ready and collection, records actor, and strips private data", async () => {
    const { t, token, userId } = await setup();
    await t.mutation(internal.orders.upsertToast, orderData());
    const list = await t.query(api.orders.staffList, { token });
    const id = list[0]._id;
    expect(list[0]).not.toHaveProperty("customerCipher");
    const board = await t.query(api.orders.board, {});
    expect(board[0]).not.toHaveProperty("items");
    expect(board[0]).not.toHaveProperty("customerCipher");
    await t.mutation(api.orders.changeStatus, { token, id, status: "ready" });
    expect((await t.query(api.orders.board, {}))[0].status).toBe("ready");
    await t.mutation(api.orders.changeStatus, {
      token,
      id,
      status: "collected",
    });
    expect(await t.query(api.orders.board, {})).toHaveLength(0);
    await expect(
      t.mutation(api.orders.changeStatus, { token, id, status: "preparing" }),
    ).rejects.toThrow();
    expect(
      await t.run(async (ctx) =>
        (await ctx.db.query("orderEvents").collect()).every(
          (e) => e.userId === userId,
        ),
      ),
    ).toBe(true);
  });
  it("does not let an employee cancel", async () => {
    const { t, token } = await setup();
    await t.mutation(internal.orders.upsertToast, orderData());
    const [o] = await t.query(api.orders.staffList, { token });
    await expect(
      t.mutation(api.orders.changeStatus, {
        token,
        id: o._id,
        status: "cancelled",
      }),
    ).rejects.toThrow("administrator");
  });
  it("deduplicates Toast orders and preserves local ready state on updates", async () => {
    const { t, token } = await setup();
    const d = orderData();
    await t.mutation(internal.orders.upsertToast, d);
    await t.mutation(internal.orders.upsertToast, d);
    const [o] = await t.query(api.orders.staffList, { token });
    await t.mutation(api.orders.changeStatus, {
      token,
      id: o._id,
      status: "ready",
    });
    await t.mutation(internal.orders.upsertToast, {
      ...d,
      toastUpdatedAt: d.toastUpdatedAt + 1000,
    });
    const rows = await t.query(api.orders.staffList, { token });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("ready");
  });
  it("revokes disabled accounts and expired sessions", async () => {
    const { t, token, userId } = await setup();
    await t.run((ctx) => ctx.db.patch(userId, { active: false }));
    expect(await t.query(api.auth.me, { token })).toBeNull();
    await expect(t.query(api.orders.staffList, { token })).rejects.toThrow();
  });
  it("locks after five reserved attempts", async () => {
    const { t } = await setup();
    for (let i = 0; i < 5; i++)
      expect(
        await t.mutation(internal.auth.reserveAttempt, {
          username: "teststaff",
        }),
      ).toBe(true);
    expect(
      await t.mutation(internal.auth.reserveAttempt, { username: "teststaff" }),
    ).toBe(false);
    await t.mutation(internal.auth.unlock, { username: "teststaff" });
    expect(
      await t.mutation(internal.auth.reserveAttempt, { username: "teststaff" }),
    ).toBe(true);
  });
});
describe("menu and preview safeguards", () => {
  it("seeds idempotently and keeps employee access scoped", async () => {
    const { t, token } = await setup("admin");
    await t.mutation(internal.menu.seed, {});
    await t.mutation(internal.menu.seed, {});
    const m = await t.query(api.menu.adminMenu, { token });
    expect(m.categories.filter((c) => c.kind === "drink")).toHaveLength(5);
    expect(m.items).toHaveLength(33);
    expect((await t.query(api.menu.publicMenu, {})).items).toHaveLength(0);
  });
  it("requires a verified backend flag to enable checkout", async () => {
    const { t, token } = await setup("admin");
    await expect(
      t.mutation(api.settings.save, {
        token,
        phone: "",
        address: "",
        hours: "",
        email: "",
        instagram: "",
        toastOrderingUrl: "https://order.toasttab.com/online/jamroc",
        orderingEnabled: true,
      }),
    ).rejects.toThrow("Connect and verify");
  });
});
describe("Toast normalization", () => {
  const sample = () => ({
    guid: "order",
    source: "Online",
    diningOption: { guid: "pickup" },
    approvalStatus: "APPROVED",
    displayNumber: "10",
    createdDate: new Date().toISOString(),
    modifiedDate: new Date().toISOString(),
    checks: [
      {
        paymentStatus: "PAID",
        customer: { firstName: "Alex Smith" },
        selections: [{ displayName: "Curry Goat", quantity: 2 }],
        payments: [{ paymentStatus: "CAPTURED" }],
      },
    ],
  });
  it("requires paid, approved pickup orders", () => {
    expect(
      normalizeToastOrder(sample(), ["Online"], ["pickup"])?.customer.firstName,
    ).toBe("Alex");
    expect(
      normalizeToastOrder(
        { ...sample(), source: "In Store" },
        ["Online"],
        ["pickup"],
      ),
    ).toBeNull();
    expect(
      normalizeToastOrder(
        { ...sample(), approvalStatus: "NEEDS_APPROVAL" },
        ["Online"],
        ["pickup"],
      ),
    ).toBeNull();
    const unpaid = sample();
    unpaid.checks[0].paymentStatus = "OPEN";
    expect(normalizeToastOrder(unpaid, ["Online"], ["pickup"])).toBeNull();
  });
});

describe("webhook boundary", () => {
  it("rejects webhook requests while Toast is disabled", async () => {
    const t = convexTest(schema, modules);
    const r = await t.fetch("/toast/webhook", { method: "POST", body: "{}" });
    expect(r.status).toBe(503);
  });
});

it("verifies Toast signatures before accepting a location", async () => {
  vi.stubEnv("TOAST_ENABLED", "true");
  vi.stubEnv("TOAST_WEBHOOK_SECRET", "test-secret");
  vi.stubEnv("TOAST_RESTAURANT_GUID", "expected-location");
  try {
    const t = convexTest(schema, modules);
    const event = { timestamp: new Date().toISOString(), eventType: "order_updated", details: { restaurantGuid: "wrong-location" } };
    const body = JSON.stringify(event);
    const bad = await t.fetch("/toast/webhook", {method:"POST", body, headers:{"Toast-Signature":"bad"}});
    expect(bad.status).toBe(401);
    const signature = createHmac("sha256", "test-secret").update(body + event.timestamp).digest("base64");
    const signed = await t.fetch("/toast/webhook", {method:"POST", body, headers:{"Toast-Signature":signature}});
    expect(signed.status).toBe(403);
  } finally { vi.unstubAllEnvs(); }
});
it("expires sessions before allowing order access", async () => {
  const { t, token } = await setup();
  await t.run(async ctx => {const session = await ctx.db.query("sessions").first(); await ctx.db.patch(session!._id,{expiresAt:Date.now()-1});});
  expect(await t.query(api.auth.me,{token})).toBeNull();
  await expect(t.query(api.orders.staffList,{token})).rejects.toThrow("UNAUTHORIZED");
});
