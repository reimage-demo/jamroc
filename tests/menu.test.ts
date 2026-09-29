import { it, expect } from "vitest";
import { convexTest } from "convex-test";
import { createHash } from "node:crypto";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
const modules = import.meta.glob("../convex/**/*.ts");
it("can publish, change category, and clear a price without leaking drafts", async () => {
  const t = convexTest(schema, modules),
    token = "a".repeat(64);
  await t.run(async (ctx) => {
    const id = await ctx.db.insert("users", {
      username: "admin",
      role: "admin",
      salt: "a".repeat(32),
      hash: "x",
      active: true,
      createdAt: Date.now(),
    });
    await ctx.db.insert("sessions", {
      userId: id,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: Date.now() + 60000,
    });
  });
  await t.mutation(internal.menu.seed, {});
  const data = await t.query(api.menu.adminMenu, { token });
  const item = data.items[0];
  const fields = {
    token,
    id: item._id,
    name: item.name,
    description: item.description,
    kind: item.kind,
    categorySlug: item.categorySlug,
    price: 1800,
    published: true,
    isAvailable: true,
    sortOrder: 0,
    illustrative: true,
    options: [],
  };
  await t.mutation(api.menu.save, fields);
  expect((await t.query(api.menu.publicMenu, {})).items[0].price).toBe(1800);
  const { price, ...unpriced } = fields;
  await t.mutation(api.menu.save, unpriced);
  expect(
    (await t.query(api.menu.publicMenu, {})).items[0].price,
  ).toBeUndefined();
  await expect(
    t.mutation(api.menu.save, { ...unpriced, categorySlug: "cocktails" }),
  ).rejects.toThrow("matching category");
});
