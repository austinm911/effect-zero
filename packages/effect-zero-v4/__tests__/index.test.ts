import { expect, test } from "vite-plus/test";
import {
  defaultBenchmarkScenarios,
  evaluateAdapterContract,
  expandBenchmarkPlan,
  upstreamDrizzleAdapterCapabilities,
} from "@effect-zero/test-utils";
import { adapter, describePackage, manifest, performancePlan } from "../src/manifest.js";
import * as rootEntryPoint from "../src/index.js";

test("beta track manifest points at Effect v4", () => {
  expect(manifest.effectLine).toBe("v4");
  expect(manifest.effectVersion).toBe("4.0.0-beta.31");
  expect(describePackage()).toContain("0.26.1");
});

test("beta track satisfies the shared adapter contract scaffold", () => {
  const report = evaluateAdapterContract(adapter, {
    effectLine: "v4",
    effectVersion: "4.0.0-beta.31",
    zeroVersion: "0.26.1",
    contextRepoNames: [
      "effect-v4-beta",
      "drizzle-orm-v1.0.0-beta.17",
      "rocicorp-mono",
      "rocicorp-ztunes",
      "rocicorp-drizzle-zero",
    ],
    plannedCapabilities: [
      "clientEntryPoint",
      "createDbConnection",
      "createRestMutatorHandler",
      "createServerMutatorHandler",
      "createZeroDbProvider",
      "extendServerMutator",
      "serverEntryPoint",
      ...upstreamDrizzleAdapterCapabilities,
      "verifyDrizzleEffectV4Interoperability",
    ],
    pendingContractTests: [],
  });

  expect(report.failures).toEqual([]);
});

test("beta track manifest reports an implemented adapter", () => {
  expect(manifest.status).toBe("implemented");
});

test("beta track defines a shared benchmark plan against drizzle and zero layers", () => {
  expect(performancePlan.targets.map((target) => target.id)).toEqual([
    "drizzle-direct",
    "effect-v4-dbconnection",
    "zero-mutation-layer-v4",
    "zql-read-layer-v4",
  ]);

  expect(expandBenchmarkPlan(performancePlan)).toHaveLength(defaultBenchmarkScenarios.length * 4);
});

test("beta track root entrypoint stays adapter-agnostic", () => {
  expect(rootEntryPoint).not.toHaveProperty("createDbConnection");
  expect(rootEntryPoint).not.toHaveProperty("createZeroDbProvider");
  expect(rootEntryPoint).not.toHaveProperty("zeroEffectDrizzle");
});
