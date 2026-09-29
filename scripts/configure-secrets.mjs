// Applies an existing protected local secret backup; never prints its contents.
import { spawnSync } from "node:child_process";
import { stat } from "node:fs/promises";
const prod = process.argv.includes("--prod"),
  file = ".env.security." + (prod ? "prod" : "dev");
const info = await stat(file);
if (info.mode & 0o077) throw new Error("Secret backup must have mode 0600");
const result = spawnSync(
  "npx",
  ["convex", "env", "set", "--from-file", file, ...(prod ? ["--prod"] : [])],
  { encoding: "utf8" },
);
if (result.status !== 0)
  throw new Error(
    "Unable to apply secrets; inspect configuration in the Convex dashboard.",
  );
console.log("Security configuration applied.");
