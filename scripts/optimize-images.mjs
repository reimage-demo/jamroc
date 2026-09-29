import sharp from "sharp";
import { readdir, mkdir, stat } from "node:fs/promises";
await mkdir("admin-portal/public/assets", { recursive: true });
await sharp("assets/brand/logo-original.png")
  .resize({ width: 550 })
  .webp({ quality: 85 })
  .toFile("assets/brand/logo.webp");
await sharp("assets/brand/logo-original.png")
  .resize({ width: 250 })
  .webp({ quality: 82 })
  .toFile("admin-portal/public/assets/logo.webp");
for (const f of await readdir("assets/images/menu"))
  if (f.endsWith(".png")) {
    const out = "assets/images/menu/" + f.replace(".png", ".webp");
    await sharp("assets/images/menu/" + f)
      .resize(1200, 900, { fit: "cover" })
      .webp({ quality: 80 })
      .toFile(out);
    if ((await stat(out)).size > 350 * 1024)
      await sharp("assets/images/menu/" + f)
        .resize(1000, 750, { fit: "cover" })
        .webp({ quality: 70 })
        .toFile(out);
  }
console.log("Logo and available menu images optimized.");
