import { readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(version);
  if (!match) {
    throw new Error(`Unsupported version format: ${version}`);
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ?? null,
  };
}

function formatVersion({ major, minor, patch, prerelease }) {
  return `${major}.${minor}.${patch}${prerelease ? `-${prerelease}` : ""}`;
}

function nextPrerelease(version, preid) {
  const parsed = parseVersion(version);
  if (parsed.prerelease) {
    const parts = parsed.prerelease.split(".");
    const prereleaseId = parts[0];
    const prereleaseNumber = Number(parts[1] ?? "0");
    if (prereleaseId === preid && Number.isFinite(prereleaseNumber)) {
      return formatVersion({
        ...parsed,
        prerelease: `${preid}.${prereleaseNumber + 1}`,
      });
    }
  }

  return formatVersion({
    major: parsed.major,
    minor: parsed.minor,
    patch: parsed.patch + 1,
    prerelease: `${preid}.0`,
  });
}

function bumpVersion(version, releaseType, preid) {
  const parsed = parseVersion(version);

  switch (releaseType) {
    case "patch":
      return formatVersion({
        major: parsed.major,
        minor: parsed.minor,
        patch: parsed.patch + 1,
        prerelease: null,
      });
    case "minor":
      return formatVersion({
        major: parsed.major,
        minor: parsed.minor + 1,
        patch: 0,
        prerelease: null,
      });
    case "prerelease":
      return nextPrerelease(version, preid ?? "beta");
    default:
      throw new Error(`Unsupported release type: ${releaseType}`);
  }
}

const [, , packageDirArg, releaseTypeArg, ...rest] = process.argv;
if (!packageDirArg || !releaseTypeArg) {
  throw new Error(
    "Usage: node tools/release-package.mjs <package-dir> <patch|minor|prerelease> [--preid beta]",
  );
}

const preidFlagIndex = rest.indexOf("--preid");
const preid = preidFlagIndex === -1 ? undefined : rest[preidFlagIndex + 1];

const repoRoot = process.cwd();
const packageDir = resolve(repoRoot, packageDirArg);
const packageJsonPath = join(packageDir, "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const currentVersion = packageJson.version;
const nextVersion = bumpVersion(currentVersion, releaseTypeArg, preid);

packageJson.version = nextVersion;
writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);

const packageDirName = basename(packageDir);
const releaseScope = packageDirName.replace(/^effect-zero-/, "");
const packageName = packageJson.name;
const releaseTag = `${packageDirName}@${nextVersion}`;

console.log(`Updated ${packageName} ${currentVersion} -> ${nextVersion}`);
console.log("");
console.log("Next steps:");
console.log(`1. pnpm release:check`);
console.log(`2. git add ${packageJsonPath}`);
console.log(`3. git commit -m "release(${releaseScope}): cut ${nextVersion}"`);
console.log(`4. git tag ${releaseTag}`);
console.log(
  `5. ${packageDirName === "effect-zero-v4" && nextVersion.includes("-") ? "pnpm publish:v4:beta" : `pnpm publish:${releaseScope}`}`,
);
