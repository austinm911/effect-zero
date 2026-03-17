import {
  defaultBenchmarkScenarios,
  formatManifest,
  upstreamDrizzleAdapterCapabilities,
} from "@effect-zero/test-utils";

export const adapter = {
  manifest: {
    packageName: "@effect-zero/v4",
    effectLine: "v4",
    effectVersion: "4.0.0-beta.31",
    zeroVersion: "0.26.1",
    dbConnectionGoal:
      "Implement a publishable Zero DBConnection against the Effect v4 beta line using the pinned Drizzle ORM beta Effect Postgres sources rather than Zero's built-in postgres adapter.",
    status: "implemented",
    contextRepos: [
      {
        name: "effect-v4-beta",
        path: ".context/effect-v4-beta",
        ref: "effect@4.0.0-beta.31",
      },
      {
        name: "drizzle-orm-v1.0.0-beta.17",
        path: ".context/drizzle-orm-v1.0.0-beta.17",
        ref: "v1.0.0-beta.17",
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
  },
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
} as const;

export const manifest = adapter.manifest;

export const performancePlan = {
  fixture: {
    mutationName: "cart-item-upsert",
    mutationDescription:
      "Insert or upsert one cart-item-shaped row through the selected write path.",
    queryName: "artist-by-id",
    queryDescription: "Fetch one artist-like row by id through the selected read path.",
  },
  targets: [
    {
      id: "drizzle-direct",
      label: "Drizzle direct await",
      layer: "drizzle-direct",
      effectLine: "none",
    },
    {
      id: "effect-v4-dbconnection",
      label: "Effect v4 DBConnection",
      layer: "dbconnection",
      effectLine: "v4",
    },
    {
      id: "zero-mutation-layer-v4",
      label: "Zero mutation layer via Effect v4",
      layer: "zero-mutation-layer",
      effectLine: "v4",
    },
    {
      id: "zql-read-layer-v4",
      label: "ZQL read layer via Effect v4",
      layer: "zql-read-layer",
      effectLine: "v4",
    },
  ],
  scenarios: defaultBenchmarkScenarios,
} as const;

export function describePackage() {
  return formatManifest(manifest);
}
