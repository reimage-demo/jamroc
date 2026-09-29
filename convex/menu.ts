import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { requireStaff } from "./auth";
import { kind, option } from "./schema";
import { catalog } from "./catalog";
const fields = {
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
};
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
function safeImage(url?: string) {
  if (
    url &&
    !(
      /^assets\/images\/menu\/[a-z0-9-]+\.webp$/.test(url) ||
      /^https:\/\//.test(url)
    )
  )
    throw new Error("Image must use HTTPS");
}
async function withImage(ctx: any, item: any) {
  return {
    ...item,
    imageUrl: item.imageStorageId
      ? await ctx.storage.getUrl(item.imageStorageId)
      : item.imageUrl,
  };
}
export const publicMenu = query({
  args: {},
  handler: async (ctx) => ({
    preview: process.env.MENU_PREVIEW_ENABLED === "true",
    categories: await ctx.db.query("menuCategories").collect(),
    items: await Promise.all(
      (await ctx.db.query("menuItems").collect())
        .filter(
          (i) => i.published || process.env.MENU_PREVIEW_ENABLED === "true",
        )
        .map((i) => withImage(ctx, i)),
    ),
  }),
});
export const adminMenu = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await requireStaff(ctx, token, true);
    return {
      categories: await ctx.db.query("menuCategories").collect(),
      items: await Promise.all(
        (await ctx.db.query("menuItems").collect()).map((i) =>
          withImage(ctx, i),
        ),
      ),
    };
  },
});
export const save = mutation({
  args: { token: v.string(), id: v.optional(v.id("menuItems")), ...fields },
  handler: async (ctx, { token, id, ...data }) => {
    const user = await requireStaff(ctx, token, true);
    if (
      !data.name.trim() ||
      data.name.length > 100 ||
      data.description.length > 1200 ||
      data.options.length > 20 ||
      !Number.isFinite(data.sortOrder)
    )
      throw new Error("Invalid menu details");
    if (
      data.price !== undefined &&
      (!Number.isFinite(data.price) ||
        data.price < 0 ||
        data.price > 100000 ||
        Math.round(data.price) !== data.price)
    )
      throw new Error("Price must be a whole number of cents");
    const cat = await ctx.db
      .query("menuCategories")
      .withIndex("by_slug", (q) => q.eq("slug", data.categorySlug))
      .unique();
    if (!cat || cat.kind !== data.kind)
      throw new Error("Choose a matching category");
    safeImage(data.imageUrl);
    for (const o of data.options) {
      if (!o.name.trim() || o.name.length > 100)
        throw new Error("Invalid option");
      safeImage(o.imageUrl);
    }
    const old = id ? await ctx.db.get(id) : null;
    if (id && !old) throw new Error("Item no longer exists");
    if (data.imageStorageId && data.imageStorageId !== old?.imageStorageId) {
      const upload = await ctx.db
        .query("uploads")
        .withIndex("by_storage", (q) => q.eq("storageId", data.imageStorageId!))
        .unique();
      if (!upload || upload.userId !== user._id)
        throw new Error("Upload this image first");
    }
    if (id)
      await ctx.db.patch(id, {
        ...data,
        price: data.price,
        updatedAt: Date.now(),
      });
    else
      await ctx.db.insert("menuItems", {
        ...data,
        slug: slug(data.name) + "-" + Date.now().toString(36),
        updatedAt: Date.now(),
      });
  },
});
export const remove = mutation({
  args: { token: v.string(), id: v.id("menuItems") },
  handler: async (ctx, { token, id }) => {
    await requireStaff(ctx, token, true);
    await ctx.db.delete(id);
  },
});
export const saveCategory = mutation({
  args: {
    token: v.string(),
    id: v.optional(v.id("menuCategories")),
    name: v.string(),
    kind,
    sortOrder: v.number(),
  },
  handler: async (ctx, { token, id, ...data }) => {
    await requireStaff(ctx, token, true);
    if (
      !data.name.trim() ||
      data.name.length > 80 ||
      !Number.isFinite(data.sortOrder)
    )
      throw new Error("Invalid category");
    if (id) {
      const old = await ctx.db.get(id);
      if (!old || old.kind !== data.kind) throw new Error("Invalid category");
      await ctx.db.patch(id, data);
    } else {
      const key = slug(data.name);
      if (
        !key ||
        (await ctx.db
          .query("menuCategories")
          .withIndex("by_slug", (q) => q.eq("slug", key))
          .unique())
      )
        throw new Error("Category already exists");
      await ctx.db.insert("menuCategories", { ...data, slug: key });
    }
  },
});
export const removeCategory = mutation({
  args: { token: v.string(), id: v.id("menuCategories") },
  handler: async (ctx, { token, id }) => {
    await requireStaff(ctx, token, true);
    const cat = await ctx.db.get(id);
    if (!cat) return;
    if (
      (await ctx.db.query("menuItems").collect()).some(
        (i) => i.categorySlug === cat.slug,
      )
    )
      throw new Error("Move or remove this category’s items first");
    await ctx.db.delete(id);
  },
});
export const uploadUrl = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await requireStaff(ctx, token, true);
    return ctx.storage.generateUploadUrl();
  },
});
export const registerUpload = mutation({
  args: { token: v.string(), storageId: v.id("_storage") },
  handler: async (ctx, { token, storageId }) => {
    const user = await requireStaff(ctx, token, true);
    const meta = await ctx.db.system.get(storageId);
    if (
      !meta ||
      meta.size > 500 * 1024 ||
      !["image/webp", "image/png", "image/jpeg"].includes(
        meta.contentType ?? "",
      )
    ) {
      if (meta) await ctx.storage.delete(storageId);
      throw new Error("Upload a WebP, JPEG or PNG under 500 KB");
    }
    if (
      await ctx.db
        .query("uploads")
        .withIndex("by_storage", (q) => q.eq("storageId", storageId))
        .unique()
    )
      throw new Error("Image already registered");
    await ctx.db.insert("uploads", {
      storageId,
      userId: user._id,
      createdAt: Date.now(),
    });
    return await ctx.storage.getUrl(storageId);
  },
});
export const seed = internalMutation({
  args: {},
  handler: async (ctx) => {
    for (const cat of catalog.categories)
      if (
        !(await ctx.db
          .query("menuCategories")
          .withIndex("by_slug", (q) => q.eq("slug", cat.slug))
          .unique())
      )
        await ctx.db.insert("menuCategories", cat);
    for (const item of catalog.items)
      if (
        !(await ctx.db
          .query("menuItems")
          .withIndex("by_slug", (q) => q.eq("slug", item.slug))
          .unique())
      )
        await ctx.db.insert("menuItems", {
          ...item,
          options: item.options.map((o) => ({ ...o })),
          updatedAt: Date.now(),
        });
    if (!(await ctx.db.query("settings").first()))
      await ctx.db.insert("settings", {
        key: "site",
        phone: "",
        address: "",
        hours: "",
        email: "",
        instagram: "",
        toastOrderingUrl: "",
        orderingEnabled: false,
        updatedAt: Date.now(),
      });
  },
});
