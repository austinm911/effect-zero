import { expect, test } from "vite-plus/test";
import {
  defaultBenchmarkScenarios,
  evaluateAdapterContract,
  expandBenchmarkPlan,
  upstreamDrizzleAdapterCapabilities,
} from "@effect-zero/test-utils";
import { adapter, describePackage, manifest, performancePlan } from "../src/manifest.js";
import * as rootEntryPoint from "../src/index.js";

test("stable track manifest points at Effect v3", () => {
  expect(manifest.effectLine).toBe("v3");
  expect(manifest.effectVersion).toBe("3.19.19");
  expect(describePackage()).toContain("0.26.1");
});

test("stable track satisfies the shared adapter contract scaffold", () => {
  const report = evaluateAdapterContract(adapter, {
    effectLine: "v3",
    effectVersion: "3.19.19",
    zeroVersion: "0.26.1",
    contextRepoNames: ["effect-v3", "rocicorp-mono", "rocicorp-ztunes", "rocicorp-drizzle-zero"],
    plannedCapabilities: [
      "clientEntryPoint",
      "createDbConnection",
      "createRestMutatorHandler",
      "createServerMutatorHandler",
      "createZeroDbProvider",
      "extendServerMutator",
      "serverEntryPoint",
      ...upstreamDrizzleAdapterCapabilities,
      "verifyDrizzleEffectPostgresInteroperability",
    ],
    pendingContractTests: [],
  });

  expect(report.failures).toEqual([]);
});

test("stable track manifest records an implemented adapter lane", () => {
  expect(manifest.status).toBe("implemented");
  expect(adapter.pendingContractTests).toEqual([]);
});

test("stable track defines a shared benchmark plan against drizzle and zero layers", () => {
  expect(performancePlan.targets.map((target) => target.id)).toEqual([
    "drizzle-direct",
    "effect-v3-dbconnection",
    "zero-mutation-layer-v3",
    "zql-read-layer-v3",
  ]);

  expect(expandBenchmarkPlan(performancePlan)).toHaveLength(defaultBenchmarkScenarios.length * 4);
});

test("stable track root entrypoint stays adapter-agnostic", () => {
  expect(rootEntryPoint).not.toHaveProperty("createDbConnection");
  expect(rootEntryPoint).not.toHaveProperty("createZeroDbProvider");
  expect(rootEntryPoint).not.toHaveProperty("zeroEffectDrizzle");
});
