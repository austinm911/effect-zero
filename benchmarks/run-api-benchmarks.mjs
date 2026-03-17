import { execSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createMusicFixtureApiFixtures,
  createMusicFixtureApiPerformanceFixtureCatalog,
  createMusicFixtureApiPerformanceFixtures,
  createMusicFixtureZeroMutateCartAddFixture,
  defaultMusicFixtureApiTarget,
  musicFixtureApiBenchmarkTargets,
  musicFixtureApiTargetIds,
} from "../packages/test-utils/src/api-fixtures.ts";
import {
  defaultBenchmarkScenarios,
  summarizeBenchmarkMeasurements,
} from "../packages/test-utils/src/index.ts";
import {
  formatPayload,
  invokeFixture,
  isObject,
  parseArgs,
  parseCsvFilter,
  parsePositiveInteger,
  resolveRepoRoot,
  trimTrailingSlash,
  withRepoLock,
} from "../tools/fixture-verification.mjs";

const repoRoot = resolveRepoRoot(import.meta.url);

const args = parseArgs(process.argv.slice(2));
const baseUrl = trimTrailingSlash(
  args["base-url"] ?? process.env.BENCH_BASE_URL ?? "http://localhost:4310",
);
const outputDir = path.resolve(repoRoot, args["output-dir"] ?? "benchmarks/results");
const requestTimeoutMs = parsePositiveInteger(
  args["request-timeout-ms"],
  30_000,
  "request-timeout-ms",
);
const sampleCount = parsePositiveInteger(args.samples, 5, "samples");
const includeDirect = parseBoolean(args["include-direct"], true);
const fixtureFilter = parseCsvFilter(args.fixture);
const targetFilter = parseCsvFilter(args.target);
const scenarioFilter = parseCsvFilter(args.scenario);
const selectedTargets = (
  targetFilter === null ? musicFixtureApiBenchmarkTargets : musicFixtureApiTargetIds
).filter((target) => (targetFilter === null ? true : targetFilter.has(target)));
const scenarios = defaultBenchmarkScenarios.filter((scenario) =>
  scenarioFilter === null ? true : scenarioFilter.has(scenario.id),
);
const packageMetadata = await loadPackageMetadata();
await withRepoLock({
  conflictMessage:
    "Another API benchmark run is already active. Do not run package and web benchmark commands concurrently against the shared local fixture database.",
  importMetaUrl: import.meta.url,
  lockRelativePath: "benchmarks/.api-benchmark.lock",
  metadata: {
    baseUrl,
    outputDir,
  },
  operation: async () => {
  if (selectedTargets.length === 0) {
    throw new Error("No benchmark targets selected. Check --target filters.");
  }

  if (scenarios.length === 0) {
    throw new Error("No benchmark scenarios selected. Check --scenario filters.");
  }

  const defaultPerformanceFixtures = selectedTargets.flatMap((target) =>
    createMusicFixtureApiPerformanceFixtures({ target }),
  );
  const performanceFixtureCatalog = selectedTargets.flatMap((target) =>
    createMusicFixtureApiPerformanceFixtureCatalog({ target }),
  );
  const performanceFixtures = (
    fixtureFilter === null ? defaultPerformanceFixtures : performanceFixtureCatalog
  ).filter((fixture) => {
    if (!includeDirect && fixture.benchmarkTargetId === "drizzle-direct") {
      return false;
    }

    return fixtureFilter === null ? true : fixtureFilter.has(fixture.id);
  });

  if (performanceFixtures.length === 0) {
    throw new Error("No benchmark fixtures selected. Check --fixture filters.");
  }

  await ensureApiReady(
    baseUrl,
    createMusicFixtureApiFixtures({
      target: selectedTargets[0] ?? defaultMusicFixtureApiTarget,
    }).control.state,
  );

  const generatedAt = new Date().toISOString();
  const gitSha = readGitSha();
  const results = [];

  for (const fixture of performanceFixtures) {
    const scenariosForFixture = scenarios.filter(
      (scenario) => scenario.operation === fixture.operation,
    );
    const targetPackage =
      fixture.benchmarkTargetId === "drizzle-direct"
        ? packageMetadata.direct
        : packageMetadata[fixture.target];

    for (const scenario of scenariosForFixture) {
      const measurements = [];

      for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
        await invokeBenchmarkFixture(
          baseUrl,
          createMusicFixtureApiFixtures({
            target: fixture.target,
          }).control.reset,
        );

        if (scenario.temperature === "warm") {
          await runScenarioIteration(baseUrl, fixture, scenario, sampleIndex, {
            phase: "warmup",
          });
        }

        const requestMeasurements = await runScenarioIteration(
          baseUrl,
          fixture,
          scenario,
          sampleIndex,
          {
            phase: "measured",
          },
        );
        measurements.push(...requestMeasurements);
      }

      const summary = summarizeBenchmarkMeasurements(measurements);
      const result = {
        batchSampleCount: sampleCount,
        benchmarkEffectLine: fixture.benchmarkEffectLine,
        benchmarkLayer: fixture.benchmarkLayer,
        benchmarkTargetId: fixture.benchmarkTargetId,
        benchmarkTargetLabel: fixture.benchmarkTargetLabel,
        databaseConnectionMode: targetPackage.databaseConnectionMode,
        fixtureId: fixture.id,
        generatedAt,
        gitSha,
        iterations: scenario.iterations,
        method: fixture.method,
        nodeVersion: process.version,
        operation: fixture.operation,
        packageName: targetPackage.packageName,
        packageVersion: targetPackage.packageVersion,
        path: fixture.path,
        sampleCount,
        scenarioId: scenario.id,
        summary,
        target: fixture.target,
        temperature: scenario.temperature,
        transport: fixture.transport,
      };

      results.push(result);
      console.log(
        [
          result.benchmarkTargetId,
          result.scenarioId,
          `avg=${summary.avgMs}ms`,
          `p95=${summary.p95Ms}ms`,
          `ops=${summary.opsPerSecond}/s`,
        ].join(" "),
      );
    }
  }

  const artifact = {
    baseUrl,
    generatedAt,
    gitSha,
    kind: "api-benchmark-run",
    nodeVersion: process.version,
    packageMetadata,
    results,
    sampleCount,
    targets: selectedTargets,
  };

  await mkdir(outputDir, { recursive: true });

  const timestampForFile = generatedAt.replaceAll(":", "-");
  const runPath = path.join(outputDir, `api-${timestampForFile}.json`);
  const latestPath = path.join(outputDir, "latest.json");

  const artifactJson = `${JSON.stringify(artifact, null, 2)}\n`;
  await writeFile(runPath, artifactJson, "utf8");
  await writeFile(latestPath, artifactJson, "utf8");

  console.log(`Wrote ${path.relative(repoRoot, runPath)}`);
  console.log(`Updated ${path.relative(repoRoot, latestPath)}`);
  },
});

async function ensureApiReady(baseUrl, stateFixture) {
  try {
    await invokeBenchmarkFixture(baseUrl, stateFixture);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `API benchmark runner could not reach ${baseUrl}. Start the frontend with \`pnpm dev\`, the Node harness with \`pnpm dev:api\` when benchmarking package targets, the local Postgres stack with \`pnpm dev:db\`, and Zero Cache with \`pnpm dev:zero\`. Cause: ${message}`,
    );
  }
}

async function runScenarioIteration(baseUrl, fixture, scenario, sampleIndex, runContext) {
  const executeOnce = async (iterationIndex) => {
    const requestFixture = createRequestFixtureForIteration(
      fixture,
      scenario,
      sampleIndex,
      iterationIndex,
      runContext.phase,
    );
    const startedAt = performance.now();
    await invokeBenchmarkFixture(baseUrl, requestFixture);
    return {
      durationMs: performance.now() - startedAt,
      iterations: 1,
    };
  };

  if (scenario.execution === "parallel") {
    return Promise.all(
      Array.from({ length: scenario.iterations }, (_, iterationIndex) =>
        executeOnce(iterationIndex),
      ),
    );
  }

  const measurements = [];

  for (let iterationIndex = 0; iterationIndex < scenario.iterations; iterationIndex += 1) {
    measurements.push(await executeOnce(iterationIndex));
  }

  return measurements;
}

function createRequestFixtureForIteration(fixture, scenario, sampleIndex, iterationIndex, phase) {
  const timestampBase =
    1_743_127_752_952 + sampleIndex * 10_000 + iterationIndex * 10 + (phase === "warmup" ? 0 : 1);
  const benchmarkUserId = `bench-user-${fixture.target}-${sampleIndex}-${phase}-${iterationIndex}`;

  if (fixture.id === "direct-mutator-cart-add" || fixture.id === "drizzle-direct-cart-add") {
    return {
      ...fixture,
      body: {
        ...fixture.body,
        __benchmarkUserId: benchmarkUserId,
        addedAt: timestampBase,
      },
    };
  }

  if (fixture.id !== "zero-mutate-cart-add") {
    return fixture;
  }

  const zeroMutateUserId =
    scenario.execution === "parallel"
      ? benchmarkUserId
      : `bench-user-${fixture.target}-${sampleIndex}`;

  if (scenario.execution === "parallel") {
    return createMusicFixtureZeroMutateCartAddFixture({
      clientGroupID: `cg-bench-${fixture.target}-${sampleIndex}-${phase}-${iterationIndex}`,
      clientID: `c-bench-${fixture.target}-${sampleIndex}-${phase}-${iterationIndex}`,
      mutationID: 1,
      target: fixture.target,
      timestamp: timestampBase,
      userId: zeroMutateUserId,
    });
  }

  const mutationOffset =
    phase === "warmup" ? 0 : scenario.temperature === "warm" ? scenario.iterations : 0;

  return createMusicFixtureZeroMutateCartAddFixture({
    clientGroupID: `cg-bench-${fixture.target}-${sampleIndex}`,
    clientID: `c-bench-${fixture.target}-${sampleIndex}`,
    mutationID: mutationOffset + iterationIndex + 1,
    target: fixture.target,
    timestamp: timestampBase,
    userId: zeroMutateUserId,
  });
}

async function invokeBenchmarkFixture(baseUrl, fixture) {
  const payload = await invokeFixture(baseUrl, fixture, { requestTimeoutMs });
  validateFixtureResponse(fixture, payload);
  return payload;
}

function validateFixtureResponse(fixture, payload) {
  if (fixture.transport === "demo" || fixture.transport === "demo-query") {
    if (!isObject(payload) || !Array.isArray(payload.artists) || !("protocol" in payload)) {
      throw new Error(`Unexpected demo payload for ${fixture.id}: ${formatPayload(payload)}`);
    }
    return;
  }

  if (fixture.transport === "direct-mutator") {
    if (!isObject(payload) || payload.ok !== true) {
      throw new Error(`Unexpected mutator payload for ${fixture.id}: ${formatPayload(payload)}`);
    }
    return;
  }

  if (fixture.transport === "drizzle-direct") {
    if (fixture.operation === "mutation") {
      if (!isObject(payload) || payload.ok !== true) {
        throw new Error(
          `Unexpected drizzle direct mutation payload for ${fixture.id}: ${formatPayload(payload)}`,
        );
      }
      return;
    }

    if (payload === undefined) {
      throw new Error(
        `Unexpected drizzle direct query payload for ${fixture.id}: ${formatPayload(payload)}`,
      );
    }
    return;
  }

  if (fixture.transport === "zql-read") {
    if (payload === undefined) {
      throw new Error(`Unexpected zql read payload for ${fixture.id}: ${formatPayload(payload)}`);
    }
    return;
  }

  if (fixture.transport === "zero-mutate") {
    if (!isObject(payload) || !Array.isArray(payload.mutations)) {
      throw new Error(
        `Unexpected zero mutate payload for ${fixture.id}: ${formatPayload(payload)}`,
      );
    }
    return;
  }

  if (fixture.transport === "zero-query") {
    if (!Array.isArray(payload) || payload[0] !== "transformed") {
      throw new Error(`Unexpected zero query payload for ${fixture.id}: ${formatPayload(payload)}`);
    }
  }
}

async function loadPackageMetadata() {
  const [exampleZtunesPackage, v3Package, v4Package] = await Promise.all([
    readPackageJson("examples/ztunes/package.json"),
    readPackageJson("packages/effect-zero-v3/package.json"),
    readPackageJson("packages/effect-zero-v4/package.json"),
  ]);

  return {
    control: {
      databaseConnectionMode: "zeroPostgresJS-control",
      packageName: exampleZtunesPackage.name,
      packageVersion: exampleZtunesPackage.version,
    },
    direct: {
      databaseConnectionMode: "drizzle-direct-postgresjs",
      packageName: exampleZtunesPackage.name,
      packageVersion: exampleZtunesPackage.version,
    },
    "v3-drizzle": {
      databaseConnectionMode: "effect-v3-drizzle",
      packageName: v3Package.name,
      packageVersion: v3Package.version,
    },
    "v3-pg": {
      databaseConnectionMode: "effect-v3-pg",
      packageName: v3Package.name,
      packageVersion: v3Package.version,
    },
    "v3-postgresjs": {
      databaseConnectionMode: "effect-v3-postgresjs",
      packageName: v3Package.name,
      packageVersion: v3Package.version,
    },
    "v4-drizzle": {
      databaseConnectionMode: "effect-v4-drizzle",
      packageName: v4Package.name,
      packageVersion: v4Package.version,
    },
    "v4-pg": {
      databaseConnectionMode: "effect-v4-pg",
      packageName: v4Package.name,
      packageVersion: v4Package.version,
    },
    "v4-postgresjs": {
      databaseConnectionMode: "effect-v4-postgresjs",
      packageName: v4Package.name,
      packageVersion: v4Package.version,
    },
  };
}

async function readPackageJson(relativePath) {
  const packagePath = path.join(repoRoot, relativePath);
  return JSON.parse(await readFile(packagePath, "utf8"));
}

function parseBoolean(rawValue, fallback) {
  if (rawValue === undefined) {
    return fallback;
  }

  const normalized = String(rawValue).trim().toLowerCase();

  if (normalized === "true") {
    return true;
  }

  if (normalized === "false") {
    return false;
  }

  throw new Error(`Expected a boolean value, received ${String(rawValue)}.`);
}
function readGitSha() {
  try {
    return execSync("git rev-parse HEAD", {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "uncommitted-worktree";
  }
}
