// Publish only the built artifact to a separate gh-pages branch. No force pushes.
import { mkdtemp, cp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
const admin = process.argv.includes("--admin");
const repo = admin ? "reimage-demo/jamroc-admin" : "reimage-demo/jamroc";
const source = resolve(admin ? "admin-portal/dist" : "dist");
const dir = await mkdtemp(join(tmpdir(), "jamroc-publish-"));
function run(cmd, args, cwd = dir) {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`${cmd} failed: ${r.stderr || r.stdout}`);
  return r.stdout.trim();
}
try {
  run("git", ["init", "-b", "gh-pages"]);
  run("git", ["config", "user.name", "Jam Roc Build"]);
  run("git", ["config", "user.email", "jamroc-build@users.noreply.github.com"]);
  run("git", [
    "remote",
    "add",
    "origin",
    "https://github.com/" + repo + ".git",
  ]);
  const exists = run("git", ["ls-remote", "--heads", "origin", "gh-pages"]);
  if (exists) {
    run("git", ["fetch", "origin", "gh-pages"]);
    run("git", ["reset", "--hard", "FETCH_HEAD"]);
    run("git", ["rm", "-r", "--ignore-unmatch", "."]);
  }
  await cp(source, dir, { recursive: true });
  await writeFile(join(dir, ".nojekyll"), "");
  run("git", ["add", "."]);
  const changes = run("git", ["status", "--porcelain"]);
  if (changes) {
    run("git", ["commit", "-m", "Publish Jam Roc site"]);
    run("git", ["push", "origin", "gh-pages"]);
  }
  console.log("Published artifact to " + repo + " / gh-pages.");
} finally {
  await rm(dir, { recursive: true, force: true });
}
