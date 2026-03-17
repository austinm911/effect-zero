export type AdapterStatus = "scaffolded" | "implemented";

export type EffectLine = "v3" | "v4";

export interface ContextRepoRef {
  readonly name: string;
  readonly path: string;
  readonly ref: string;
}

export interface AdapterManifest {
  readonly packageName: string;
  readonly effectLine: EffectLine;
  readonly effectVersion: string;
  readonly zeroVersion: string;
  readonly dbConnectionGoal: string;
  readonly status: AdapterStatus;
  readonly contextRepos: readonly ContextRepoRef[];
}

export interface AdapterScaffold {
  readonly manifest: AdapterManifest;
  readonly plannedCapabilities: readonly string[];
  readonly pendingContractTests: readonly string[];
}

export interface AdapterContractExpectations {
  readonly effectLine: EffectLine;
  readonly effectVersion: string;
  readonly zeroVersion: string;
  readonly contextRepoNames: readonly string[];
  readonly plannedCapabilities: readonly string[];
  readonly pendingContractTests: readonly string[];
}

export interface AdapterContractReport {
  readonly failures: readonly string[];
  readonly summary: string;
}

export type BenchmarkOperation = "mutation" | "query";

export type BenchmarkTemperature = "cold" | "warm";

export type BenchmarkExecution = "single" | "serial" | "parallel";

export type BenchmarkLayer =
  | "drizzle-direct"
  | "dbconnection"
  | "zero-mutation-layer"
  | "zero-query-layer"
  | "zql-read-layer";

export type BenchmarkEffectLine = EffectLine | "none";

export interface BenchmarkScenario {
  readonly id: string;
  readonly operation: BenchmarkOperation;
  readonly temperature: BenchmarkTemperature;
  readonly execution: BenchmarkExecution;
  readonly iterations: number;
}

export interface BenchmarkFixture {
  readonly mutationName: string;
  readonly mutationDescription: string;
  readonly queryName: string;
  readonly queryDescription: string;
}

export interface BenchmarkTarget {
  readonly id: string;
  readonly label: string;
  readonly layer: BenchmarkLayer;
  readonly effectLine: BenchmarkEffectLine;
}

export interface BenchmarkPlan {
  readonly fixture: BenchmarkFixture;
  readonly targets: readonly BenchmarkTarget[];
  readonly scenarios: readonly BenchmarkScenario[];
}

export interface BenchmarkMatrixEntry {
  readonly fixture: BenchmarkFixture;
  readonly target: BenchmarkTarget;
  readonly scenario: BenchmarkScenario;
}

export interface BenchmarkMeasurement {
  readonly durationMs: number;
  readonly iterations: number;
}

export interface BenchmarkSummary {
  readonly sampleCount: number;
  readonly totalIterations: number;
  readonly minMs: number;
  readonly maxMs: number;
  readonly avgMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly opsPerSecond: number;
}

export const upstreamDrizzleAdapterCapabilities = [
  "supportsDbTransactionRawSqlQuery",
  "exposesWrappedDrizzleTransaction",
] as const;

export const upstreamDrizzleAdapterContractTests = [
  "tx.dbTransaction.query supports raw SQL",
  "tx.dbTransaction.wrappedTransaction exposes native Drizzle query APIs",
] as const;

export const defaultBenchmarkScenarios = [
  {
    id: "mutation.cold.single.1",
    operation: "mutation",
    temperature: "cold",
    execution: "single",
    iterations: 1,
  },
  {
    id: "mutation.warm.single.1",
    operation: "mutation",
    temperature: "warm",
    execution: "single",
    iterations: 1,
  },
  {
    id: "mutation.warm.serial.10",
    operation: "mutation",
    temperature: "warm",
    execution: "serial",
    iterations: 10,
  },
  {
    id: "mutation.warm.serial.100",
    operation: "mutation",
    temperature: "warm",
    execution: "serial",
    iterations: 100,
  },
  {
    id: "mutation.warm.parallel.10",
    operation: "mutation",
    temperature: "warm",
    execution: "parallel",
    iterations: 10,
  },
  {
    id: "mutation.warm.parallel.100",
    operation: "mutation",
    temperature: "warm",
    execution: "parallel",
    iterations: 100,
  },
  {
    id: "query.cold.single.1",
    operation: "query",
    temperature: "cold",
    execution: "single",
    iterations: 1,
  },
  {
    id: "query.warm.single.1",
    operation: "query",
    temperature: "warm",
    execution: "single",
    iterations: 1,
  },
  {
    id: "query.warm.serial.10",
    operation: "query",
    temperature: "warm",
    execution: "serial",
    iterations: 10,
  },
  {
    id: "query.warm.serial.100",
    operation: "query",
    temperature: "warm",
    execution: "serial",
    iterations: 100,
  },
  {
    id: "query.warm.parallel.10",
    operation: "query",
    temperature: "warm",
    execution: "parallel",
    iterations: 10,
  },
  {
    id: "query.warm.parallel.100",
    operation: "query",
    temperature: "warm",
    execution: "parallel",
    iterations: 100,
  },
] as const satisfies readonly BenchmarkScenario[];

export function formatManifest(manifest: AdapterManifest): string {
  return `${manifest.packageName} targets Effect ${manifest.effectVersion} and Zero ${manifest.zeroVersion} (${manifest.status}).`;
}

export function createNotImplementedError(packageName: string, capability: string): Error {
  return new Error(`${packageName} has not implemented ${capability} yet.`);
}

export function evaluateAdapterContract(
  scaffold: AdapterScaffold,
  expectations: AdapterContractExpectations,
): AdapterContractReport {
  const failures: string[] = [];

  if (scaffold.manifest.effectLine !== expectations.effectLine) {
    failures.push(
      `Expected effect line ${expectations.effectLine} but got ${scaffold.manifest.effectLine}.`,
    );
  }

  if (scaffold.manifest.effectVersion !== expectations.effectVersion) {
    failures.push(
      `Expected effect version ${expectations.effectVersion} but got ${scaffold.manifest.effectVersion}.`,
    );
  }

  if (scaffold.manifest.zeroVersion !== expectations.zeroVersion) {
    failures.push(
      `Expected zero version ${expectations.zeroVersion} but got ${scaffold.manifest.zeroVersion}.`,
    );
  }

  const contextRepoNames = scaffold.manifest.contextRepos.map((repo) => repo.name);
  if (!haveSameItems(contextRepoNames, expectations.contextRepoNames)) {
    failures.push(
      `Expected context repos ${expectations.contextRepoNames.join(", ")} but got ${contextRepoNames.join(", ")}.`,
    );
  }

  if (!haveSameItems(scaffold.plannedCapabilities, expectations.plannedCapabilities)) {
    failures.push(
      `Expected planned capabilities ${expectations.plannedCapabilities.join(", ")} but got ${scaffold.plannedCapabilities.join(", ")}.`,
    );
  }

  if (!haveSameItems(scaffold.pendingContractTests, expectations.pendingContractTests)) {
    failures.push(
      `Expected pending contract tests ${expectations.pendingContractTests.join(", ")} but got ${scaffold.pendingContractTests.join(", ")}.`,
    );
  }

  return {
    failures,
    summary: formatManifest(scaffold.manifest),
  };
}

export function expandBenchmarkPlan(plan: BenchmarkPlan): BenchmarkMatrixEntry[] {
  return plan.scenarios.flatMap((scenario) =>
    plan.targets.map((target) => ({
      fixture: plan.fixture,
      target,
      scenario,
    })),
  );
}

export function summarizeBenchmarkMeasurements(
  measurements: readonly BenchmarkMeasurement[],
): BenchmarkSummary {
  if (measurements.length === 0) {
    return {
      sampleCount: 0,
      totalIterations: 0,
      minMs: 0,
      maxMs: 0,
      avgMs: 0,
      p50Ms: 0,
      p95Ms: 0,
      opsPerSecond: 0,
    };
  }

  const durations = measurements
    .map((measurement) => measurement.durationMs)
    .sort((left, right) => {
      return left - right;
    });
  const totalDurationMs = durations.reduce((sum, duration) => sum + duration, 0);
  const totalIterations = measurements.reduce(
    (sum, measurement) => sum + measurement.iterations,
    0,
  );

  return {
    sampleCount: measurements.length,
    totalIterations,
    minMs: durations[0] ?? 0,
    maxMs: durations.at(-1) ?? 0,
    avgMs: roundMetric(totalDurationMs / measurements.length),
    p50Ms: percentile(durations, 0.5),
    p95Ms: percentile(durations, 0.95),
    opsPerSecond:
      totalDurationMs === 0 ? 0 : roundMetric((totalIterations / totalDurationMs) * 1000),
  };
}

function haveSameItems(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function percentile(sortedDurations: readonly number[], ratio: number): number {
  if (sortedDurations.length === 0) {
    return 0;
  }

  const index = Math.ceil(sortedDurations.length * ratio) - 1;
  return roundMetric(sortedDurations[Math.max(0, index)] ?? 0);
}

function roundMetric(value: number): number {
  return Math.round(value * 100) / 100;
}
