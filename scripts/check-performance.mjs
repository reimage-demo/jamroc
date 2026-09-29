import { readFile, readdir, stat } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { catalog } from "../catalog.js";
let errors = [];
async function budget(path, max, gzip = false) {
  const b = await readFile(path);
  const size = gzip ? gzipSync(b).length : b.length;
  if (size > max) errors.push(`${path}: ${size} exceeds ${max}`);
}
await budget("assets/brand/logo.webp", 80 * 1024);
await budget("vendor/convex-client.js", 30 * 1024, true);
let adminSize = 0;
for (const file of await readdir("admin-portal/dist/assets"))
  if (file.endsWith(".js"))
    adminSize += gzipSync(
      await readFile("admin-portal/dist/assets/" + file),
    ).length;
if (adminSize > 90 * 1024) errors.push("Admin JS exceeds 90 KB gzip");
for (const item of catalog.items) {
  for (const path of [item.imageUrl, ...item.options.map((o) => o.imageUrl)]) {
    try {
      await budget(path, 350 * 1024);
    } catch {
      errors.push("Missing asset: " + path);
    }
  }
}
for (const file of [
  "index.html",
  "menu.html",
  "contact.html",
  "order-status.html",
]) {
  const html = await readFile("dist/" + file, "utf8");
  for (const match of html.matchAll(
    /(?:src|href)="([^"#?]+)(?:[?#][^"]*)?"/g,
  )) {
    const path = match[1];
    if (/^(https?:|mailto:)/.test(path)) continue;
    try {
      await stat("dist/" + path);
    } catch {
      errors.push(file + " missing " + path);
    }
  }
}
const forbidden = [
  "convex",
  "admin-portal",
  "node_modules",
  ".env.local",
  "package.json",
];
for (const f of forbidden)
  try {
    await stat("dist/" + f);
    errors.push("Private/build file in public artifact: " + f);
  } catch {}
if (errors.length) throw new Error(errors.join("\n"));
console.log(
  "PASS: media and bundle budgets, public assets, deployment isolation.",
);
