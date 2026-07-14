import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tempRoot = mkdtempSync(join(tmpdir(), "effect-zero-install-check-"));
const workspaceCatalog = loadWorkspaceCatalog();
const packageSpecs = parsePackageSpecs(process.argv.slice(2));

const allPackageEntries = [
  {
    packageDir: resolve(repoRoot, "packages/effect-zero-v3"),
    packageJson: loadPackageJson("packages/effect-zero-v3/package.json"),
  },
  {
    packageDir: resolve(repoRoot, "packages/effect-zero-v4"),
    packageJson: loadPackageJson("packages/effect-zero-v4/package.json"),
  },
];
const knownPackageNames = new Set(allPackageEntries.map((entry) => entry.packageJson.name));
for (const packageName of packageSpecs.keys()) {
  if (!knownPackageNames.has(packageName)) {
    throw new Error(`Unknown package spec: ${packageName}`);
  }
}
const packageEntries = allPackageEntries.filter(
  (entry) => packageSpecs.size === 0 || packageSpecs.has(entry.packageJson.name),
);

const installScenarios = [
  {
    imports: ["", "client", "server", "timestamps", "openapi"],
    ignoreScripts: true,
    name: "base",
    peerDependencies: [],
  },
  {
    imports: ["server/adapters/drizzle"],
    ignoreScripts: true,
    name: "drizzle",
    peerDependencies: ["drizzle-orm"],
  },
  {
    imports: ["server/adapters/pg"],
    ignoreScripts: true,
    name: "pg",
    peerDependencies: ["pg"],
  },
  {
    imports: ["server/adapters/postgresjs"],
    ignoreScripts: true,
    name: "postgresjs",
    peerDependencies: ["postgres"],
  },
  {
    imports: ["openapi/zod"],
    ignoreScripts: true,
    name: "openapi-zod",
    peerDependencies: ["zod"],
  },
  {
    imports: ["openapi/elysia"],
    ignoreScripts: true,
    name: "openapi-elysia",
    peerDependencies: ["elysia"],
  },
  {
    imports: ["openapi/hono"],
    ignoreScripts: true,
    name: "openapi-hono",
    peerDependencies: ["hono"],
  },
];

const results = [];

try {
  for (const entry of packageEntries) {
    const packageRoot = join(tempRoot, sanitizePackageName(entry.packageJson.name));
    const packRoot = join(packageRoot, "packs");

    const packedTarballPath = preparePackageSource(entry, packRoot);
    validatePackedExports(entry.packageJson, packedTarballPath);

    const packageScenarios = [
      ...installScenarios,
      ...buildScriptEnabledScenarios(entry.packageJson),
    ];

    for (const scenario of packageScenarios) {
      const appRoot = join(packageRoot, scenario.name);
      mkdirSync(appRoot, { recursive: true });
      writeFileSync(
        join(appRoot, "package.json"),
        `${JSON.stringify({ name: "effect-zero-install-smoke", private: true, type: "module" }, null, 2)}\n`,
      );

      execFileSync("pnpm", buildInstallCommand(entry.packageJson, packedTarballPath, scenario), {
        cwd: appRoot,
        stdio: "pipe",
      });

      execFileSync("node", ["--input-type=module", "--eval", buildImportScript(entry, scenario)], {
        cwd: appRoot,
        stdio: "pipe",
      });

      results.push({
        imports: scenario.imports,
        ignoreScripts: scenario.ignoreScripts,
        packageName: entry.packageJson.name,
        peerDependencies: scenario.peerDependencies,
        scenario: scenario.name,
        status: "ok",
      });
    }
  }
} finally {
  rmSync(tempRoot, { force: true, recursive: true });
}

console.log(JSON.stringify({ results, status: "ok" }, null, 2));

function buildImportScript(entry, scenario) {
  return scenario.imports
    .map((subpath) => {
      const specifier = subpath ? `${entry.packageJson.name}/${subpath}` : entry.packageJson.name;
      return `await import(${JSON.stringify(specifier)});`;
    })
    .join("\n");
}

function buildInstallCommand(packageJson, packedTarballPath, scenario) {
  return [
    "--config.minimum-release-age=0",
    "add",
    ...(scenario.ignoreScripts ? ["--ignore-scripts"] : []),
    packedTarballPath,
    `@rocicorp/zero@${packageJson.devDependencies["@rocicorp/zero"]}`,
    `effect@${packageJson.devDependencies.effect}`,
    ...scenario.peerDependencies.map(
      (dependencyName) =>
        `${dependencyName}@${resolveDependencyVersion(packageJson, dependencyName)}`,
    ),
  ];
}

function preparePackageSource(entry, packRoot) {
  const explicitSpec = packageSpecs.get(entry.packageJson.name);

  if (explicitSpec) {
    if (isAbsolute(explicitSpec) || explicitSpec.startsWith("file:")) {
      return explicitSpec;
    }

    const expectedPrefix = `${entry.packageJson.name}@`;
    const version = explicitSpec.startsWith(expectedPrefix)
      ? explicitSpec.slice(expectedPrefix.length)
      : "";

    if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
      throw new Error(
        `Package spec must be an absolute/file tarball or exact registry version: ${explicitSpec}`,
      );
    }

    return explicitSpec;
  }

  mkdirSync(packRoot, { recursive: true });
  execFileSync("pnpm", ["pack", "--pack-destination", packRoot], {
    cwd: entry.packageDir,
    stdio: "pipe",
  });

  const packedFile = readdirSync(packRoot).find((fileName) => fileName.endsWith(".tgz"));

  if (!packedFile) {
    throw new Error(`Failed to pack ${entry.packageJson.name}`);
  }

  return join(packRoot, packedFile);
}

function validatePackedExports(packageJson, packageSource) {
  if (!isAbsolute(packageSource) && !packageSource.startsWith("file:")) {
    return;
  }

  const tarballPath = packageSource.startsWith("file:")
    ? fileURLToPath(packageSource)
    : packageSource;
  const packedFiles = new Set(
    execFileSync("tar", ["-tzf", tarballPath], { encoding: "utf8" }).trim().split("\n"),
  );

  for (const [subpath, target] of Object.entries(packageJson.exports ?? {})) {
    const targets = typeof target === "string" ? [target] : Object.values(target);

    for (const exportTarget of targets) {
      const packedPath = `package/${exportTarget.replace(/^\.\//, "")}`;
      if (!packedFiles.has(packedPath)) {
        throw new Error(
          `Missing packed export ${subpath} -> ${exportTarget} in ${packageJson.name}`,
        );
      }
    }
  }
}

function parsePackageSpecs(args) {
  const specs = new Map();

  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== "--package-spec") {
      throw new Error(`Unknown argument: ${args[index]}`);
    }

    const rawSpec = args[index + 1];
    const separatorIndex = rawSpec?.indexOf("=") ?? -1;
    if (separatorIndex < 1) {
      throw new Error("Use --package-spec <package-name>=<tarball-or-exact-registry-spec>");
    }

    const packageName = rawSpec.slice(0, separatorIndex);
    if (specs.has(packageName)) {
      throw new Error(`Duplicate package spec: ${packageName}`);
    }
    specs.set(packageName, rawSpec.slice(separatorIndex + 1));
    index += 1;
  }

  return specs;
}

function loadPackageJson(relativePath) {
  return JSON.parse(readFileSync(resolve(repoRoot, relativePath), "utf8"));
}

function resolveDependencyVersion(packageJson, dependencyName) {
  const rawVersion =
    packageJson.peerDependencies?.[dependencyName] ??
    packageJson.devDependencies?.[dependencyName] ??
    packageJson.dependencies?.[dependencyName];

  if (!rawVersion) {
    throw new Error(`Missing dependency version for ${dependencyName} in ${packageJson.name}`);
  }

  if (rawVersion === "catalog:") {
    const catalogVersion = workspaceCatalog[dependencyName];

    if (!catalogVersion) {
      throw new Error(`Missing workspace catalog version for ${dependencyName}`);
    }

    return catalogVersion;
  }

  return rawVersion;
}

function sanitizePackageName(packageName) {
  return packageName.replaceAll("/", "-").replaceAll("@", "");
}

function buildScriptEnabledScenarios(packageJson) {
  if (!packageJson.scripts?.postinstall) {
    return [];
  }

  return [
    {
      imports: ["server/adapters/drizzle"],
      ignoreScripts: false,
      name: "drizzle-postinstall",
      peerDependencies: ["drizzle-orm"],
    },
  ];
}

function loadWorkspaceCatalog() {
  const workspaceFile = readFileSync(resolve(repoRoot, "pnpm-workspace.yaml"), "utf8");
  const catalogBlock = workspaceFile.match(/^catalog:\n((?:^  .+\n)+)/m)?.[1];

  if (!catalogBlock) {
    return {};
  }

  return Object.fromEntries(
    catalogBlock
      .trim()
      .split("\n")
      .map((rawLine) => {
        const line = rawLine.trim();
        const [, dependencyName, version] = line.match(/^"?(.*?)"?:\s+(.+)$/) ?? [];

        if (!dependencyName || !version) {
          throw new Error(`Unable to parse workspace catalog line: ${line}`);
        }

        return [dependencyName, version];
      }),
  );
}
