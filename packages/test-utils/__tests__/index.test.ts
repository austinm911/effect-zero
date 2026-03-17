import { expect, test } from "vite-plus/test";
import {
  defaultBenchmarkScenarios,
  evaluateAdapterContract,
  expandBenchmarkPlan,
  formatManifest,
  summarizeBenchmarkMeasurements,
} from "../src";

test("formatManifest", () => {
  const manifest = {
    packageName: "@effect-zero/example",
    effectLine: "v3",
    effectVersion: "3.19.19",
    zeroVersion: "0.26.1",
    dbConnectionGoal: "Smoke-test manifest formatting.",
    status: "scaffolded",
    contextRepos: [],
  } as const;

  expect(formatManifest(manifest)).toContain("3.19.19");
  expect(formatManifest(manifest)).toContain("0.26.1");
});

test("evaluateAdapterContract reports no failures for a matching scaffold", () => {
  const manifest = {
    packageName: "@effect-zero/example",
    effectLine: "v3",
    effectVersion: "3.19.19",
    zeroVersion: "0.26.1",
    dbConnectionGoal: "Exercise the shared test harness.",
    status: "scaffolded",
    contextRepos: [
      {
        name: "effect-v3",
        path: ".context/effect-v3",
        ref: "effect@3.19.19",
      },
    ],
  } as const;

  const scaffold = {
    manifest,
    plannedCapabilities: ["createDbConnection"],
    pendingContractTests: ["constructs a Zero DBConnection"],
  } as const;

  const report = evaluateAdapterContract(scaffold, {
    effectLine: "v3",
    effectVersion: "3.19.19",
    zeroVersion: "0.26.1",
    contextRepoNames: ["effect-v3"],
    plannedCapabilities: ["createDbConnection"],
    pendingContractTests: ["constructs a Zero DBConnection"],
  });

  expect(report.failures).toEqual([]);
});

test("defaultBenchmarkScenarios cover cold and warm query/mutation workloads", () => {
  expect(defaultBenchmarkScenarios.map((scenario) => scenario.id)).toEqual([
    "mutation.cold.single.1",
    "mutation.warm.single.1",
    "mutation.warm.serial.10",
    "mutation.warm.serial.100",
    "mutation.warm.parallel.10",
    "mutation.warm.parallel.100",
    "query.cold.single.1",
    "query.warm.single.1",
    "query.warm.serial.10",
    "query.warm.serial.100",
    "query.warm.parallel.10",
    "query.warm.parallel.100",
  ]);
});

test("expandBenchmarkPlan creates the full target-by-scenario matrix", () => {
  const plan = {
    fixture: {
      mutationName: "cart-item-upsert",
      mutationDescription: "Insert or upsert one cart-item-shaped row.",
      queryName: "artist-by-id",
      queryDescription: "Fetch one artist-like row by id.",
    },
    targets: [
      {
        id: "drizzle-direct",
        label: "Drizzle direct await",
        layer: "drizzle-direct",
        effectLine: "none",
      },
      {
        id: "effect-v3-dbconnection",
        label: "Effect v3 DBConnection",
        layer: "dbconnection",
        effectLine: "v3",
      },
    ],
    scenarios: defaultBenchmarkScenarios.slice(0, 3),
  } as const;

  const matrix = expandBenchmarkPlan(plan);
  expect(matrix).toHaveLength(6);
  expect(matrix[0]?.scenario.id).toBe("mutation.cold.single.1");
  expect(matrix[0]?.target.id).toBe("drizzle-direct");
  expect(matrix[5]?.target.id).toBe("effect-v3-dbconnection");
});

test("summarizeBenchmarkMeasurements computes latency percentiles and throughput", () => {
  const summary = summarizeBenchmarkMeasurements([
    { durationMs: 10, iterations: 1 },
    { durationMs: 20, iterations: 1 },
    { durationMs: 30, iterations: 1 },
    { durationMs: 40, iterations: 1 },
    { durationMs: 50, iterations: 1 },
  ]);

  expect(summary.sampleCount).toBe(5);
  expect(summary.minMs).toBe(10);
  expect(summary.maxMs).toBe(50);
  expect(summary.avgMs).toBe(30);
  expect(summary.p50Ms).toBe(30);
  expect(summary.p95Ms).toBe(50);
  expect(summary.opsPerSecond).toBeCloseTo(33.33, 2);
});
