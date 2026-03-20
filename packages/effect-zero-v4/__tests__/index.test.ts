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
      "createInlinePostCommitScheduler",
      "createDbConnection",
      "createMutationExecutor",
      "createRestMutatorHandler",
      "createServerMutatorHandler",
      "createWaitUntilPostCommitScheduler",
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

test("beta track exports the mutation executor helpers", () => {
  expect(rootEntryPoint).toHaveProperty("createInlinePostCommitScheduler");
  expect(rootEntryPoint).toHaveProperty("createMutationExecutor");
  expect(rootEntryPoint).toHaveProperty("createWaitUntilPostCommitScheduler");
});

test("beta track keeps Zero and Effect as peers instead of runtime dependencies", () => {
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
    effect: "4.0.0-beta.31",
  });
  expect(packageJson.peerDependencies).toMatchObject({
    "@rocicorp/zero": ">=0.26.0 <1",
    effect: "4.0.0-beta.31",
  });
});
