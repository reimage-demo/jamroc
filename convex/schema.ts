import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
export const role = v.union(v.literal("admin"), v.literal("employee"));
export const kind = v.union(v.literal("food"), v.literal("drink"));
export const status = v.union(
  v.literal("preparing"),
  v.literal("ready"),
  v.literal("collected"),
  v.literal("cancelled"),
);
export const option = v.object({
  name: v.string(),
  imageUrl: v.optional(v.string()),
});
export default defineSchema({
  users: defineTable({
    username: v.string(),
    role,
    salt: v.string(),
    hash: v.string(),
    active: v.boolean(),
    createdAt: v.number(),
  }).index("by_username", ["username"]),
  sessions: defineTable({
    tokenHash: v.string(),
    userId: v.id("users"),
    expiresAt: v.number(),
  }).index("by_token", ["tokenHash"]),
  loginAttempts: defineTable({
    username: v.string(),
    failures: v.number(),
    locked: v.boolean(),
    updatedAt: v.number(),
  }).index("by_username", ["username"]),
  menuCategories: defineTable({
    slug: v.string(),
    name: v.string(),
    kind,
    sortOrder: v.number(),
  }).index("by_slug", ["slug"]),
  menuItems: defineTable({
    slug: v.string(),
    name: v.string(),
    description: v.string(),
    kind,
    categorySlug: v.string(),
    price: v.optional(v.number()),
    published: v.boolean(),
    isAvailable: v.boolean(),
    sortOrder: v.number(),
    imageUrl: v.optional(v.string()),
    imageStorageId: v.optional(v.id("_storage")),
    illustrative: v.boolean(),
    options: v.array(option),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_kind", ["kind"]),
  uploads: defineTable({
    storageId: v.id("_storage"),
    userId: v.id("users"),
    createdAt: v.number(),
  }).index("by_storage", ["storageId"]),
  settings: defineTable({
    key: v.string(),
    phone: v.string(),
    address: v.string(),
    hours: v.string(),
    email: v.string(),
    instagram: v.string(),
    toastOrderingUrl: v.string(),
    orderingEnabled: v.boolean(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),
  orders: defineTable({
    toastGuid: v.string(),
    orderNumber: v.string(),
    customerCipher: v.string(),
    items: v.array(v.object({ name: v.string(), quantity: v.number() })),
    status,
    paymentState: v.union(
      v.literal("paid"),
      v.literal("refunded"),
      v.literal("voided"),
    ),
    source: v.literal("toast"),
    createdAt: v.number(),
    updatedAt: v.number(),
    toastUpdatedAt: v.number(),
    lastChangedBy: v.optional(v.id("users")),
  })
    .index("by_toast", ["toastGuid"])
    .index("by_created", ["createdAt"])
    .index("by_status", ["status"])
    .index("by_status_created", ["status", "createdAt"]),
  orderEvents: defineTable({
    orderId: v.id("orders"),
    userId: v.id("users"),
    from: status,
    to: status,
    createdAt: v.number(),
  }).index("by_order", ["orderId"]),
  toastAccess: defineTable({
    key: v.string(),
    nextRequestAt: v.number(),
    pausedUntil: v.optional(v.number()),
    tokenCipher: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    refreshOwner: v.optional(v.string()),
    refreshUntil: v.optional(v.number()),
    lastRefreshAt: v.optional(v.number()),
  }).index("by_key", ["key"]),
  webhookEvents: defineTable({
    eventId: v.string(),
    orderGuid: v.string(),
    state: v.union(
      v.literal("pending"),
      v.literal("processed"),
      v.literal("failed"),
    ),
    attempts: v.number(),
    lastError: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_event", ["eventId"]),
});
