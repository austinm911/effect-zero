import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const entrypoints = [
  path.join(workspaceRoot, "examples/ztunes/app/zero/mutators.ts"),
  path.join(workspaceRoot, "packages/example-data/src/index.ts"),
  path.join(workspaceRoot, "packages/effect-zero-v3/src/client.ts"),
  path.join(workspaceRoot, "packages/effect-zero-v4/src/client.ts"),
];

const workspacePackages = new Map(
  [
    "packages/test-utils",
    "packages/effect-zero-v3",
    "packages/effect-zero-v4",
    "packages/example-data",
    "examples/ztunes",
  ].map((relativePath) => {
    const packageJsonPath = path.join(workspaceRoot, relativePath, "package.json");
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    return [packageJson.name, { packageJson, packageJsonPath }];
  }),
);

const bannedImportRules = [
  { matcher: /^@effect-zero\/v3(?:\/server(?:\/|$)|$)/, reason: "v3 server entrypoint" },
  { matcher: /^@effect-zero\/v4(?:\/server(?:\/|$)|$)/, reason: "v4 server entrypoint" },
  { matcher: /^@rocicorp\/zero\/server(?:\/|$)/, reason: "Zero server entrypoint" },
  { matcher: /^@effect\/sql-pg(?:\/|$)/, reason: "Effect Postgres client" },
  { matcher: /^drizzle-orm\/effect-postgres$/, reason: "Drizzle Effect Postgres driver" },
  { matcher: /^drizzle-orm\/postgres-js$/, reason: "postgres-js server driver" },
  { matcher: /^pg$/, reason: "node-postgres server driver" },
  { matcher: /^postgres$/, reason: "postgres-js server driver" },
];

const importPattern =
  /(?:import|export)\s+(?:[^"'`]*?\s+from\s+)?["']([^"'`]+)["']|import\(\s*["']([^"'`]+)["']\s*\)/g;

const visitedFiles = new Set();
const importChain = [];
const errors = [];

for (const entrypoint of entrypoints) {
  visitFile(entrypoint);
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }

  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      checkedEntrypoints: entrypoints,
      checkedFiles: Array.from(visitedFiles).sort((left, right) => left.localeCompare(right)),
      status: "ok",
    },
    null,
    2,
  ),
);

function visitFile(filePath) {
  const normalizedPath = path.normalize(filePath);

  if (visitedFiles.has(normalizedPath)) {
    return;
  }

  visitedFiles.add(normalizedPath);
  importChain.push(normalizedPath);

  try {
    const source = fs.readFileSync(normalizedPath, "utf8");
    const imports = parseImports(source);

    for (const specifier of imports) {
      checkBannedImport(specifier);
      const resolvedPath = resolveImport(normalizedPath, specifier);

      if (resolvedPath) {
        visitFile(resolvedPath);
      }
    }
  } finally {
    importChain.pop();
  }
}

function parseImports(source) {
  const matches = [];

  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1] ?? match[2];

    if (specifier) {
      matches.push(specifier);
    }
  }

  return matches;
}

function checkBannedImport(specifier) {
  for (const rule of bannedImportRules) {
    if (rule.matcher.test(specifier)) {
      errors.push(
        [
          `Client entrypoint import graph reached banned import: ${specifier}`,
          `Reason: ${rule.reason}`,
          `Chain:`,
          ...importChain.map((segment) => `  - ${segment}`),
        ].join("\n"),
      );
    }
  }
}

function resolveImport(importerPath, specifier) {
  if (specifier.startsWith(".")) {
    return resolveRelativeImport(path.dirname(importerPath), specifier);
  }

  if (specifier.startsWith("#app/")) {
    return resolveRelativeImport(
      path.join(workspaceRoot, "examples/ztunes/app"),
      `./${specifier.slice("#app/".length)}`,
    );
  }

  if (specifier.startsWith("@effect-zero/")) {
    return resolveWorkspaceImport(specifier);
  }

  return null;
}

function resolveRelativeImport(baseDirectory, specifier) {
  const absoluteBase = path.resolve(baseDirectory, specifier);
  const candidates = [
    absoluteBase,
    `${absoluteBase}.ts`,
    `${absoluteBase}.tsx`,
    `${absoluteBase}.js`,
    path.join(absoluteBase, "index.ts"),
    path.join(absoluteBase, "index.tsx"),
    path.join(absoluteBase, "index.js"),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function resolveWorkspaceImport(specifier) {
  const matchedPackage = Array.from(workspacePackages.keys())
    .sort((left, right) => right.length - left.length)
    .find((packageName) => specifier === packageName || specifier.startsWith(`${packageName}/`));

  if (!matchedPackage) {
    return null;
  }

  const { packageJson, packageJsonPath } = workspacePackages.get(matchedPackage);
  const subpath =
    specifier === matchedPackage ? "." : `./${specifier.slice(matchedPackage.length + 1)}`;
  const exportTarget = resolvePackageExport(packageJson.exports, subpath);

  if (!exportTarget) {
    throw new Error(`Unable to resolve workspace export '${specifier}' from ${packageJsonPath}`);
  }

  return path.resolve(path.dirname(packageJsonPath), exportTarget);
}

function resolvePackageExport(exportsMap, subpath) {
  if (typeof exportsMap === "string") {
    return subpath === "." ? exportsMap : null;
  }

  if (!exportsMap || typeof exportsMap !== "object") {
    return null;
  }

  const directMatch = exportsMap[subpath];

  if (typeof directMatch === "string") {
    return directMatch;
  }

  if (directMatch && typeof directMatch === "object") {
    return directMatch.import ?? directMatch.default ?? null;
  }

  return null;
}
