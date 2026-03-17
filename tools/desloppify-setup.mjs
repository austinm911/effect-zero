import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const excludes = [
  ".desloppify",
  ".context",
  ".alchemy",
  ".tanstack",
  "node_modules",
  "dist",
  "dist-ssr",
  "tmp",
  "verification",
  "benchmarks/results",
];

for (const pattern of excludes) {
  execFileSync("desloppify", ["exclude", pattern], {
    cwd: repoRoot,
    stdio: "inherit",
  });
}
