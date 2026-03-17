import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const rawArgs = process.argv.slice(2);
const args = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;
const [packageDirArg, ...rest] = args;

if (!packageDirArg) {
  throw new Error("Usage: node tools/publish-package.mjs <package-dir> [--tag beta]");
}

const packageDir = resolve(process.cwd(), packageDirArg);
execFileSync("npm", ["publish", ...rest], {
  cwd: packageDir,
  stdio: "inherit",
});
