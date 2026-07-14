import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { waitForServer } from "./package-api-process.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tempRoots = new Set();

after(() => {
  for (const root of tempRoots) rmSync(root, { force: true, recursive: true });
});

test("tarball verifier accepts and fingerprints the release contract", () => {
  const tarball = createTarball();
  const result = runVerifier(tarball);
  assert.equal(result.status, 0, result.stderr);
  const manifest = JSON.parse(result.stdout);
  assert.equal(manifest.name, "@awstin/effect-zero-v4");
  assert.equal(manifest.sha256, createHash("sha256").update(readFileSync(tarball)).digest("hex"));
});

test("tarball verifier accepts the pnpm argument separator", () => {
  const tarball = createTarball();
  const manifestPath = join(dirname(tarball), "manifest.json");
  const result = spawnSync(
    process.execPath,
    [join(repoRoot, "tools/verify-package-tarball.mjs"), "--", tarball, manifestPath],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(readFileSync(manifestPath, "utf8")).name, "@awstin/effect-zero-v4");
});

test("tarball verifier rejects unexpected files, secrets, and package metadata", () => {
  const unexpected = runVerifier(createTarball({ "private.txt": "not publishable" }));
  assert.notEqual(unexpected.status, 0);
  assert.match(unexpected.stderr, /Unexpected packed files/);

  const secret = runVerifier(
    createTarball({ "dist/index.mjs": "export const token = 'npm_abcdefghijklmnopqrstuvwxyz';" }),
  );
  assert.notEqual(secret.status, 0);
  assert.match(secret.stderr, /Potential secret matched/);

  const metadata = runVerifier(createTarball({}, { name: "@example/wrong-package" }));
  assert.notEqual(metadata.status, 0);
  assert.match(metadata.stderr, /Unexpected package name/);
});

test("release helper prints only protected publishing next steps", () => {
  const v4 = runReleaseHelper(
    "effect-zero-v4",
    { name: "@awstin/effect-zero-v4", version: "0.2.0-beta.4" },
    ["prerelease", "--preid", "beta"],
  );
  assert.match(v4, /git push origin HEAD effect-zero-v4@0\.2\.0-beta\.5/);
  assert.doesNotMatch(v4, /pnpm publish/);

  const v3 = runReleaseHelper(
    "effect-zero-v3",
    { name: "@awstin/effect-zero-v3", version: "0.1.0" },
    ["patch"],
  );
  assert.match(v3, /STOP: no protected publisher is configured/);
  assert.doesNotMatch(v3, /pnpm publish/);
});

test("readiness verification times out when a server never responds", async () => {
  const server = createServer(() => {});
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.equal(typeof address, "object");

  try {
    await assert.rejects(
      waitForServer(
        `http://127.0.0.1:${address.port}`,
        { exitCode: null },
        {
          attempts: 1,
          intervalMs: 0,
          requestTimeoutMs: 20,
        },
      ),
      /Timed out waiting/,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

function createTarball(extraFiles = {}, packageOverrides = {}) {
  const root = mkdtempSync(join(tmpdir(), "effect-zero-tarball-test-"));
  tempRoots.add(root);
  const packageRoot = join(root, "package");
  mkdirSync(join(packageRoot, "dist"), { recursive: true });
  const packageJson = {
    name: "@awstin/effect-zero-v4",
    version: "0.2.0-beta.5",
    repository: {
      type: "git",
      url: "git+https://github.com/austinm911/effect-zero.git",
      directory: "packages/effect-zero-v4",
    },
    publishConfig: { access: "public" },
    ...packageOverrides,
  };
  writeFileSync(join(packageRoot, "README.md"), "fixture\n");
  writeFileSync(join(packageRoot, "package.json"), JSON.stringify(packageJson));
  writeFileSync(join(packageRoot, "dist/index.mjs"), "export const fixture = true;\n");
  for (const [relativePath, contents] of Object.entries(extraFiles)) {
    const filePath = join(packageRoot, relativePath);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, contents);
  }
  const tarball = join(root, "candidate.tgz");
  execFileSync("tar", [
    "-czf",
    tarball,
    "-C",
    root,
    "package/README.md",
    "package/package.json",
    "package/dist/index.mjs",
    ...Object.keys(extraFiles).map((relativePath) => `package/${relativePath}`),
  ]);
  return tarball;
}

function runVerifier(tarball) {
  return spawnSync(
    process.execPath,
    [join(repoRoot, "tools/verify-package-tarball.mjs"), tarball],
    {
      encoding: "utf8",
    },
  );
}

function runReleaseHelper(packageDirName, packageJson, releaseArgs) {
  const root = mkdtempSync(join(tmpdir(), "effect-zero-release-test-"));
  tempRoots.add(root);
  const packageDir = join(root, "packages", packageDirName);
  mkdirSync(packageDir, { recursive: true });
  writeFileSync(join(packageDir, "package.json"), JSON.stringify(packageJson));
  return execFileSync(
    process.execPath,
    [join(repoRoot, "tools/release-package.mjs"), `packages/${packageDirName}`, ...releaseArgs],
    { cwd: root, encoding: "utf8" },
  );
}
