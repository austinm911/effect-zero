import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";

const [tarballArg, manifestArg] = process.argv.slice(2).filter((arg) => arg !== "--");

if (!tarballArg) {
  throw new Error("Usage: node tools/verify-package-tarball.mjs <tarball> [manifest-output]");
}

const tarballPath = resolve(tarballArg);
const archive = readFileSync(tarballPath);
const files = execFileSync("tar", ["-tzf", tarballPath], { encoding: "utf8" })
  .trim()
  .split("\n")
  .filter(Boolean)
  .sort();

const hasUnsafePathSegments = (file) =>
  file.split("/").some((segment) => !segment || segment === "." || segment === "..");
const unexpectedFiles = files.filter(
  (file) =>
    hasUnsafePathSegments(file) ||
    (file !== "package/README.md" &&
      file !== "package/package.json" &&
      !/^package\/dist\/[A-Za-z0-9_./-]+\.(?:d\.mts|mjs)$/.test(file)),
);

if (unexpectedFiles.length > 0) {
  throw new Error(`Unexpected packed files:\n${unexpectedFiles.join("\n")}`);
}

const secretPatterns = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /(?:^|[^A-Za-z0-9_])npm_[A-Za-z0-9]{20,}/,
  /(?:^|[^A-Za-z0-9_])gh[pousr]_[A-Za-z0-9]{20,}/,
  /(?:^|[^A-Z0-9])AKIA[A-Z0-9]{16}/,
  /\/\/registry\.npmjs\.org\/:_authToken\s*=/,
];

for (const file of files) {
  const contents = execFileSync("tar", ["-xOzf", tarballPath, file], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  const matchedPattern = secretPatterns.find((pattern) => pattern.test(contents));

  if (matchedPattern) {
    throw new Error(`Potential secret matched ${matchedPattern} in ${file}`);
  }
}

const packageJson = JSON.parse(
  execFileSync("tar", ["-xOzf", tarballPath, "package/package.json"], { encoding: "utf8" }),
);
if (packageJson.name !== "@awstin/effect-zero-v4") {
  throw new Error(`Unexpected package name: ${String(packageJson.name)}`);
}
if (!/^0\.\d+\.\d+-beta\.\d+$/.test(packageJson.version)) {
  throw new Error(`Unexpected package version: ${String(packageJson.version)}`);
}
if (
  packageJson.repository?.url !== "git+https://github.com/austinm911/effect-zero.git" ||
  packageJson.repository?.directory !== "packages/effect-zero-v4" ||
  packageJson.publishConfig?.access !== "public"
) {
  throw new Error("Package provenance metadata does not match the v4 release contract");
}
const manifest = {
  file: basename(tarballPath),
  files,
  name: packageJson.name,
  sha256: createHash("sha256").update(archive).digest("hex"),
  sha512: createHash("sha512").update(archive).digest("hex"),
  version: packageJson.version,
};
const json = `${JSON.stringify(manifest, null, 2)}\n`;

if (manifestArg) {
  writeFileSync(resolve(manifestArg), json);
}

process.stdout.write(json);
