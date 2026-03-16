import {
  createAdapterScaffold,
  createBenchmarkPlan,
  createBenchmarkTarget,
  createManifest,
  defaultBenchmarkScenarios,
  formatManifest,
  upstreamDrizzleAdapterCapabilities,
} from "@effect-zero/test-utils";

export const adapter = createAdapterScaffold({
  manifest: createManifest({
    packageName: "@effect-zero/v3",
    effectLine: "v3",
    effectVersion: "3.19.19",
    zeroVersion: "0.26.1",
    dbConnectionGoal:
      "Implement a publishable Zero DBConnection against the stable Effect v3 line using Drizzle Effect Postgres rather than Zero's built-in postgres adapter.",
    status: "implemented",
    contextRepos: [
      {
        name: "effect-v3",
        path: ".context/effect-v3",
        ref: "effect@3.19.19",
      },
      {
        name: "rocicorp-mono",
        path: ".context/rocicorp-mono",
        ref: "main",
      },
      {
        name: "rocicorp-ztunes",
        path: ".context/rocicorp-ztunes",
        ref: "main",
      },
      {
        name: "rocicorp-drizzle-zero",
        path: ".context/rocicorp-drizzle-zero",
        ref: "main",
      },
    ],
  }),
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

export const manifest = adapter.manifest;

export const performancePlan = createBenchmarkPlan({
  fixture: {
    mutationName: "cart-item-upsert",
    mutationDescription:
      "Insert or upsert one cart-item-shaped row through the selected write path.",
    queryName: "artist-by-id",
    queryDescription: "Fetch one artist-like row by id through the selected read path.",
  },
  targets: [
    createBenchmarkTarget({
      id: "drizzle-direct",
      label: "Drizzle direct await",
      layer: "drizzle-direct",
      effectLine: "none",
    }),
    createBenchmarkTarget({
      id: "effect-v3-dbconnection",
      label: "Effect v3 DBConnection",
      layer: "dbconnection",
      effectLine: "v3",
    }),
    createBenchmarkTarget({
      id: "zero-mutation-layer-v3",
      label: "Zero mutation layer via Effect v3",
      layer: "zero-mutation-layer",
      effectLine: "v3",
    }),
    createBenchmarkTarget({
      id: "zql-read-layer-v3",
      label: "ZQL read layer via Effect v3",
      layer: "zql-read-layer",
      effectLine: "v3",
    }),
  ],
  scenarios: defaultBenchmarkScenarios,
});

export function describePackage() {
  return formatManifest(manifest);
}
