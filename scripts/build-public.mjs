import { mkdir, cp, rm } from "node:fs/promises";
await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
for (const f of [
  "index.html",
  "menu.html",
  "contact.html",
  "order-status.html",
  "styles.css",
  "shared.js",
  "catalog.js",
  "public-config.js",
  "vendor",
])
  await cp(f, "dist/" + f, { recursive: true });
await cp("assets", "dist/assets", {
  recursive: true,
  filter: (p) => !p.endsWith(".png"),
});
console.log("Public site packaged from allowlisted files.");
