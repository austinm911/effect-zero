import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tempRoot = mkdtempSync(join(tmpdir(), "effect-zero-install-check-"));
const workspaceCatalog = loadWorkspaceCatalog();

const packageEntries = [
  {
    packageDir: resolve(repoRoot, "packages/effect-zero-v3"),
    packageJson: loadPackageJson("packages/effect-zero-v3/package.json"),
  },
  {
    packageDir: resolve(repoRoot, "packages/effect-zero-v4"),
    packageJson: loadPackageJson("packages/effect-zero-v4/package.json"),
  },
];

const installScenarios = [
  {
    imports: ["client", "server"],
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
];

const results = [];

try {
  for (const entry of packageEntries) {
    const packageRoot = join(tempRoot, sanitizePackageName(entry.packageJson.name));
    const packRoot = join(packageRoot, "packs");

    mkdirSync(packRoot, { recursive: true });

    execFileSync("pnpm", ["pack", "--pack-destination", packRoot], {
      cwd: entry.packageDir,
      stdio: "pipe",
    });

    const packedFile = readdirSync(packRoot).find((fileName) => fileName.endsWith(".tgz"));

    if (!packedFile) {
      throw new Error(`Failed to pack ${entry.packageJson.name}`);
    }

    const packedTarballPath = join(packRoot, packedFile);

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
    .map((subpath) => `await import(${JSON.stringify(`${entry.packageJson.name}/${subpath}`)});`)
    .join("\n");
}

function buildInstallCommand(packageJson, packedTarballPath, scenario) {
  return [
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
