import { readFileSync } from "node:fs";
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
      "createInlinePostCommitScheduler",
      "createDbConnection",
      "createMutationExecutor",
      "createRestMutatorHandler",
      "createServerMutatorHandler",
      "createWaitUntilPostCommitScheduler",
      "createZeroDbProvider",
      "defineEffectMutatorWithType",
      "defineServerMutatorWithType",
      "extendEffectMutatorWithType",
      "extendServerMutator",
      "extendServerMutatorWithType",
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

test("stable track exports the mutation executor helpers", () => {
  expect(rootEntryPoint).toHaveProperty("createInlinePostCommitScheduler");
  expect(rootEntryPoint).toHaveProperty("createMutationExecutor");
  expect(rootEntryPoint).toHaveProperty("createWaitUntilPostCommitScheduler");
  expect(rootEntryPoint).toHaveProperty("asErrorShape");
  expect(rootEntryPoint).toHaveProperty("convertFieldsToDate");
  expect(rootEntryPoint).toHaveProperty("convertFieldsToEpoch");
  expect(rootEntryPoint).toHaveProperty("dateToEpoch");
  expect(rootEntryPoint).toHaveProperty("epochToDate");
  expect(rootEntryPoint).toHaveProperty("defineEffectMutatorWithType");
  expect(rootEntryPoint).toHaveProperty("defineServerMutatorWithType");
  expect(rootEntryPoint).toHaveProperty("extendEffectMutatorWithType");
  expect(rootEntryPoint).toHaveProperty("extendServerMutatorWithType");
  expect(rootEntryPoint).toHaveProperty("isPushResponseLike");
});

test("stable track keeps Zero and Effect as peers instead of runtime dependencies", () => {
  const packageJson = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as {
    readonly dependencies?: Record<string, string>;
    readonly devDependencies?: Record<string, string>;
    readonly peerDependencies?: Record<string, string>;
  };

  expect(packageJson.dependencies).not.toHaveProperty("@rocicorp/zero");
  expect(packageJson.dependencies).not.toHaveProperty("effect");
  expect(packageJson.devDependencies).toMatchObject({
    "@rocicorp/zero": "0.26.1",
    effect: "3.19.19",
  });
  expect(packageJson.peerDependencies).toMatchObject({
    "@rocicorp/zero": ">=0.26.0 <1",
    effect: ">=3.19.19 <4",
  });
});
