import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const [, , packageDirArg, ...rest] = process.argv;
if (!packageDirArg) {
  throw new Error("Usage: node tools/publish-package.mjs <package-dir> [--tag beta]");
}

const packageDir = resolve(process.cwd(), packageDirArg);
execFileSync("pnpm", ["--dir", packageDir, "publish", ...rest], {
  stdio: "inherit",
});
