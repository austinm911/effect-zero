import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const configDir = join(repoRoot, ".desloppify");
const configPath = join(configDir, "config.json");
const excludes = [
  ".context",
  ".desloppify",
  ".alchemy",
  ".tanstack",
  "node_modules",
  "dist",
  "dist-ssr",
  "tmp",
  "verification",
  "benchmarks/results",
];

if (!existsSync(configDir)) {
  mkdirSync(configDir, { recursive: true });
}

const config = existsSync(configPath) ? JSON.parse(readFileSync(configPath, "utf8")) : {};

const currentExcludes = Array.isArray(config.exclude) ? config.exclude : [];
const nextExcludes = [...new Set([...currentExcludes, ...excludes])];
const changed =
  nextExcludes.length !== currentExcludes.length ||
  nextExcludes.some((pattern, index) => currentExcludes[index] !== pattern);

config.exclude = nextExcludes;

if (changed) {
  config.needs_rescan = true;
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  console.log(`Updated Desloppify excludes in ${configPath}`);
} else {
  console.log(`Desloppify excludes already up to date in ${configPath}`);
}
