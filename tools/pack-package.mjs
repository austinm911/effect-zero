import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rawArgs = process.argv.slice(2);
const args = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;

const outDirFlagIndex = args.indexOf("--out-dir");
const outDir =
  outDirFlagIndex === -1
    ? resolve(repoRoot, ".local-packs")
    : resolve(repoRoot, args[outDirFlagIndex + 1] ?? "");

const packageDirArgs = args.filter((arg, index) => {
  if (outDirFlagIndex === -1) {
    return true;
  }

  return index !== outDirFlagIndex && index !== outDirFlagIndex + 1;
});

if (packageDirArgs.length === 0) {
  throw new Error(
    "Usage: node tools/pack-package.mjs <package-dir> [<package-dir> ...] [--out-dir path]",
  );
}

mkdirSync(outDir, { recursive: true });

const packed = [];

for (const packageDirArg of packageDirArgs) {
  const packageDir = resolve(repoRoot, packageDirArg);
  const packageJsonPath = join(packageDir, "package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  const packagePrefix = `${sanitizePackageName(packageJson.name)}-`;

  for (const fileName of readdirSync(outDir)) {
    if (fileName.startsWith(packagePrefix) && fileName.endsWith(".tgz")) {
      rmSync(join(outDir, fileName), { force: true });
    }
  }

  execFileSync("pnpm", ["pack", "--pack-destination", outDir], {
    cwd: packageDir,
    stdio: "pipe",
  });

  const tarball = readdirSync(outDir)
    .filter((fileName) => fileName.startsWith(packagePrefix) && fileName.endsWith(".tgz"))
    .sort()
    .at(-1);

  if (!tarball) {
    throw new Error(`Failed to pack ${packageJson.name}`);
  }

  packed.push({
    packageName: packageJson.name,
    tarballPath: join(outDir, tarball),
  });
}

for (const entry of packed) {
  console.log(`${entry.packageName} -> ${entry.tarballPath}`);
}

function sanitizePackageName(packageName) {
  return packageName.replaceAll("/", "-").replaceAll("@", "");
}
