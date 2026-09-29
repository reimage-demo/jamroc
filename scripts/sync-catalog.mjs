import { catalog } from "../catalog.js";
import { writeFile } from "node:fs/promises";
await writeFile(
  "convex/catalog.ts",
  "// Generated from catalog.js\nexport const catalog = " +
    JSON.stringify(catalog, null, 2) +
    " as const;\n",
);
