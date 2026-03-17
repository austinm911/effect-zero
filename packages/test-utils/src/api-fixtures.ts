import type { ReadonlyJSONValue } from "@rocicorp/zero";
import type { BenchmarkEffectLine, BenchmarkLayer } from "./index.js";
import {
  MUSIC_FIXTURE_DEFAULTS,
  ZERO_CONTROL_SCHEMA,
} from "@effect-zero/example-data/server-fixture";

export type JsonPrimitive = string | number | boolean | null;

export const musicFixtureApiTargets = [
  {
    adapter: "control",
    benchmarkVisible: true,
    browserVisible: true,
    cloudflareSafe: true,
    id: "control",
    runtime: "control",
  },
  {
    adapter: "drizzle",
    benchmarkVisible: true,
    browserVisible: true,
    cloudflareSafe: false,
    id: "v3-drizzle",
    runtime: "v3",
  },
  {
    adapter: "pg",
    benchmarkVisible: false,
    browserVisible: false,
    cloudflareSafe: false,
    id: "v3-pg",
    runtime: "v3",
  },
  {
    adapter: "postgresjs",
    benchmarkVisible: false,
    browserVisible: false,
    cloudflareSafe: false,
    id: "v3-postgresjs",
    runtime: "v3",
  },
  {
    adapter: "drizzle",
    benchmarkVisible: true,
    browserVisible: true,
    cloudflareSafe: false,
    id: "v4-drizzle",
    runtime: "v4",
  },
  {
    adapter: "pg",
    benchmarkVisible: false,
    browserVisible: false,
    cloudflareSafe: false,
    id: "v4-pg",
    runtime: "v4",
  },
  {
    adapter: "postgresjs",
    benchmarkVisible: false,
    browserVisible: false,
    cloudflareSafe: false,
    id: "v4-postgresjs",
    runtime: "v4",
  },
] as const;

export type MusicFixtureApiTargetSpec = (typeof musicFixtureApiTargets)[number];
export type MusicFixtureApiTargetId = MusicFixtureApiTargetSpec["id"];
export type MusicFixtureApiRuntime = MusicFixtureApiTargetSpec["runtime"];
export type MusicFixtureApiAdapter = MusicFixtureApiTargetSpec["adapter"];

export const musicFixtureApiTargetIds = musicFixtureApiTargets.map(
  (target) => target.id,
) as readonly MusicFixtureApiTargetId[];

export const musicFixtureApiBrowserTargets = musicFixtureApiTargets
  .filter((target) => target.browserVisible)
  .map((target) => target.id) as readonly MusicFixtureApiTargetId[];

export const musicFixtureApiBenchmarkTargets = musicFixtureApiTargets
  .filter((target) => target.benchmarkVisible)
  .map((target) => target.id) as readonly MusicFixtureApiTargetId[];

export const defaultMusicFixtureApiTarget = "control" as const satisfies MusicFixtureApiTargetId;
export const MUSIC_FIXTURE_ZERO_APP_ID = "effect-zero-test";

export const MUSIC_FIXTURE_API_PATHS = {
  demoProtocolState: "/api/demo/protocol-state",
  demoReset: "/api/demo/reset",
  demoState: "/api/demo/state",
  directRead: "/api/direct/read",
  directWriteCartAdd: "/api/direct/cart/add",
  directMutatorPrefix: "/api/mutators",
  target: "/api/target",
  zqlRead: "/api/zql/read",
  zeroMutate: "/api/zero/mutate",
  zeroQuery: "/api/zero/query",
} as const;

export const MUSIC_FIXTURE_API_DEFAULTS = {
  ...MUSIC_FIXTURE_DEFAULTS,
} as const;

export const musicFixtureMutatorNames = ["cart.add", "cart.remove"] as const;

export type MusicFixtureMutatorName = (typeof musicFixtureMutatorNames)[number];

export type ApiFixtureOperation = "control" | "mutation" | "query";

export type ApiFixtureTransport =
  | "demo"
  | "demo-query"
  | "drizzle-direct"
  | "direct-mutator"
  | "zql-read"
  | "zero-mutate"
  | "zero-query";

export interface ApiRequestFixture {
  readonly id: string;
  readonly method: "GET" | "POST";
  readonly operation: ApiFixtureOperation;
  readonly path: string;
  readonly target: MusicFixtureApiTargetId;
  readonly transport: ApiFixtureTransport;
  readonly body?: ReadonlyJSONValue;
}

export interface ApiPerformanceFixture extends ApiRequestFixture {
  readonly benchmarkEffectLine: BenchmarkEffectLine;
  readonly benchmarkLayer: BenchmarkLayer;
  readonly benchmarkTargetId: string;
  readonly benchmarkTargetLabel: string;
}

export interface CreateMusicFixtureApiFixturesOptions {
  readonly albumId?: string;
  readonly artistId?: string;
  readonly clientGroupID?: string;
  readonly clientID?: string;
  readonly mutationID?: number;
  readonly search?: string;
  readonly target?: MusicFixtureApiTargetId;
  readonly timestamp?: number;
  readonly userId?: string;
}

export interface CreateMusicFixtureZeroMutateCartAddFixtureOptions {
  readonly albumId?: string;
  readonly clientGroupID?: string;
  readonly clientID?: string;
  readonly mutationID?: number;
  readonly target?: MusicFixtureApiTargetId;
  readonly timestamp?: number;
  readonly userId?: string;
}

export interface BuildMusicFixtureDemoProtocolStatePathOptions {
  readonly clientGroupID?: string;
  readonly clientID?: string;
  readonly target?: MusicFixtureApiTargetId;
  readonly userId?: string;
}

export interface CreateMusicFixtureZeroMutationOptions {
  readonly args?: ReadonlyJSONValue;
  readonly clientID?: string;
  readonly mutationID: number;
  readonly mutatorName: MusicFixtureMutatorName;
  readonly timestamp?: number;
}

export type MusicFixtureZeroMutation = Readonly<{
  args: readonly ReadonlyJSONValue[];
  clientID: string;
  id: number;
  name: MusicFixtureMutatorName;
  timestamp: number;
  type: "custom";
}>;

export type MusicFixtureZeroPushBody = Readonly<{
  clientGroupID: string;
  mutations: readonly MusicFixtureZeroMutation[];
  pushVersion: 1;
  requestID: string;
  schemaVersion: 1;
  timestamp: number;
}>;

export interface CreateMusicFixtureZeroPushFixtureOptions {
  readonly clientGroupID?: string;
  readonly fixtureId?: string;
  readonly mutations: readonly MusicFixtureZeroMutation[];
  readonly requestID?: string;
  readonly target?: MusicFixtureApiTargetId;
  readonly timestamp?: number;
}

export interface MusicFixtureApiFixtures {
  readonly control: {
    readonly reset: ApiRequestFixture;
    readonly state: ApiRequestFixture;
    readonly target: ApiRequestFixture;
  };
  readonly directDrizzle: {
    readonly cartAdd: ApiRequestFixture;
    readonly readArtist: ApiRequestFixture;
    readonly readCartItems: ApiRequestFixture;
    readonly readListArtists: ApiRequestFixture;
  };
  readonly demoQueries: {
    readonly protocolState: ApiRequestFixture;
    readonly state: ApiRequestFixture;
  };
  readonly directMutators: {
    readonly cartAdd: ApiRequestFixture;
    readonly cartRemove: ApiRequestFixture;
  };
  readonly zql: {
    readonly readArtist: ApiRequestFixture;
    readonly readCartItems: ApiRequestFixture;
    readonly readListArtists: ApiRequestFixture;
  };
  readonly zero: {
    readonly mutateCartAdd: ApiRequestFixture;
    readonly queryArtist: ApiRequestFixture;
    readonly queryCartItems: ApiRequestFixture;
    readonly queryListArtists: ApiRequestFixture;
  };
}

const musicFixtureApiTargetIdSet = new Set<string>(musicFixtureApiTargetIds);
const musicFixtureMutatorNameSet = new Set<string>(musicFixtureMutatorNames);

export function getMusicFixtureApiTargetSpec(
  target: MusicFixtureApiTargetId,
): MusicFixtureApiTargetSpec {
  return (
    musicFixtureApiTargets.find((candidate) => candidate.id === target) ?? musicFixtureApiTargets[0]
  );
}

export function parseMusicFixtureApiTarget(
  value: string | undefined | null,
): MusicFixtureApiTargetId {
  const normalized = value?.trim().toLowerCase();
  return isMusicFixtureApiTarget(normalized) ? normalized : defaultMusicFixtureApiTarget;
}

export function buildMusicFixtureDemoResetPath(target?: MusicFixtureApiTargetId) {
  return appendMusicFixtureSearchParams(MUSIC_FIXTURE_API_PATHS.demoReset, { target });
}

export function buildMusicFixtureDemoStatePath(
  options: {
    readonly artistId?: string;
    readonly search?: string;
    readonly target?: MusicFixtureApiTargetId;
  } = {},
) {
  return appendMusicFixtureSearchParams(MUSIC_FIXTURE_API_PATHS.demoState, {
    artistId: options.artistId,
    search: options.search,
    target: options.target,
  });
}

export function buildMusicFixtureDemoProtocolStatePath(
  options: BuildMusicFixtureDemoProtocolStatePathOptions = {},
) {
  return appendMusicFixtureSearchParams(MUSIC_FIXTURE_API_PATHS.demoProtocolState, {
    clientGroupID: options.clientGroupID,
    clientID: options.clientID,
    target: options.target,
    userId: options.userId,
  });
}

export function buildMusicFixtureTargetPath() {
  return MUSIC_FIXTURE_API_PATHS.target;
}

export function buildMusicFixtureMutatorPath(
  mutatorName: MusicFixtureMutatorName,
  target?: MusicFixtureApiTargetId,
) {
  return appendMusicFixtureSearchParams(
    `${MUSIC_FIXTURE_API_PATHS.directMutatorPrefix}/${mutatorName.split(".").join("/")}`,
    { target },
  );
}

export function parseMusicFixtureMutatorName(
  splat: string | undefined,
): MusicFixtureMutatorName | undefined {
  if (!splat) {
    return undefined;
  }

  const parts = splat
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return undefined;
  }

  try {
    const mutatorName = parts.map((part) => decodeURIComponent(part)).join(".");
    return isMusicFixtureMutatorName(mutatorName) ? mutatorName : undefined;
  } catch {
    return undefined;
  }
}

export function createMusicFixtureApiFixtures(
  options: CreateMusicFixtureApiFixturesOptions = {},
): MusicFixtureApiFixtures {
  const albumId = options.albumId ?? MUSIC_FIXTURE_API_DEFAULTS.albumId;
  const artistId = options.artistId ?? MUSIC_FIXTURE_API_DEFAULTS.artistId;
  const target = options.target ?? defaultMusicFixtureApiTarget;
  const search = options.search ?? "";
  const timestamp = options.timestamp ?? MUSIC_FIXTURE_API_DEFAULTS.timestamp;

  return {
    control: {
      reset: {
        id: "demo-reset",
        method: "POST",
        operation: "control",
        path: buildMusicFixtureDemoResetPath(target),
        target,
        transport: "demo",
      },
      state: {
        id: "demo-state",
        method: "GET",
        operation: "control",
        path: buildMusicFixtureDemoStatePath({ target }),
        target,
        transport: "demo",
      },
      target: {
        body: { target },
        id: "demo-target",
        method: "POST",
        operation: "control",
        path: buildMusicFixtureTargetPath(),
        target,
        transport: "demo",
      },
    },
    directDrizzle: {
      cartAdd: {
        body: {
          addedAt: timestamp,
          albumId,
        },
        id: "drizzle-direct-cart-add",
        method: "POST",
        operation: "mutation",
        path: MUSIC_FIXTURE_API_PATHS.directWriteCartAdd,
        target,
        transport: "drizzle-direct",
      },
      readArtist: {
        body: {
          args: {
            artistId,
          },
          name: "getArtist",
        },
        id: "drizzle-direct-read-artist",
        method: "POST",
        operation: "query",
        path: MUSIC_FIXTURE_API_PATHS.directRead,
        target,
        transport: "drizzle-direct",
      },
      readCartItems: {
        body: {
          args: {},
          name: "getCartItems",
        },
        id: "drizzle-direct-read-cart-items",
        method: "POST",
        operation: "query",
        path: MUSIC_FIXTURE_API_PATHS.directRead,
        target,
        transport: "drizzle-direct",
      },
      readListArtists: {
        body: {
          args: {
            limit: 50,
            search,
          },
          name: "listArtists",
        },
        id: "drizzle-direct-read-list-artists",
        method: "POST",
        operation: "query",
        path: MUSIC_FIXTURE_API_PATHS.directRead,
        target,
        transport: "drizzle-direct",
      },
    },
    demoQueries: {
      protocolState: {
        id: "demo-protocol-state",
        method: "GET",
        operation: "control",
        path: buildMusicFixtureDemoProtocolStatePath({
          clientGroupID: options.clientGroupID,
          clientID: options.clientID,
          target,
          userId: options.userId,
        }),
        target,
        transport: "demo-query",
      },
      state: {
        id: "demo-state",
        method: "GET",
        operation: "control",
        path: buildMusicFixtureDemoStatePath({
          artistId,
          search,
          target,
        }),
        target,
        transport: "demo-query",
      },
    },
    directMutators: {
      cartAdd: {
        body: {
          addedAt: timestamp,
          albumId,
        },
        id: "direct-mutator-cart-add",
        method: "POST",
        operation: "mutation",
        path: buildMusicFixtureMutatorPath("cart.add", target),
        target,
        transport: "direct-mutator",
      },
      cartRemove: {
        body: {
          albumId,
        },
        id: "direct-mutator-cart-remove",
        method: "POST",
        operation: "mutation",
        path: buildMusicFixtureMutatorPath("cart.remove", target),
        target,
        transport: "direct-mutator",
      },
    },
    zql: {
      readArtist: {
        body: {
          args: {
            artistId,
          },
          name: "getArtist",
        },
        id: "zql-read-artist",
        method: "POST",
        operation: "query",
        path: appendMusicFixtureSearchParams(MUSIC_FIXTURE_API_PATHS.zqlRead, { target }),
        target,
        transport: "zql-read",
      },
      readCartItems: {
        body: {
          args: {},
          name: "getCartItems",
        },
        id: "zql-read-cart-items",
        method: "POST",
        operation: "query",
        path: appendMusicFixtureSearchParams(MUSIC_FIXTURE_API_PATHS.zqlRead, { target }),
        target,
        transport: "zql-read",
      },
      readListArtists: {
        body: {
          args: {
            limit: 50,
            search,
          },
          name: "listArtists",
        },
        id: "zql-read-list-artists",
        method: "POST",
        operation: "query",
        path: appendMusicFixtureSearchParams(MUSIC_FIXTURE_API_PATHS.zqlRead, { target }),
        target,
        transport: "zql-read",
      },
    },
    zero: {
      mutateCartAdd: createMusicFixtureZeroMutateCartAddFixture({
        albumId,
        clientGroupID: options.clientGroupID,
        clientID: options.clientID,
        mutationID: options.mutationID,
        target,
        timestamp,
        userId: options.userId,
      }),
      queryArtist: {
        body: createZeroQueryTransformBody("getArtist", {
          artistId,
        }),
        id: "zero-query-get-artist",
        method: "POST",
        operation: "query",
        path: appendMusicFixtureSearchParams(MUSIC_FIXTURE_API_PATHS.zeroQuery, { target }),
        target,
        transport: "zero-query",
      },
      queryCartItems: {
        body: createZeroQueryTransformBody("getCartItems", {}),
        id: "zero-query-get-cart-items",
        method: "POST",
        operation: "query",
        path: appendMusicFixtureSearchParams(MUSIC_FIXTURE_API_PATHS.zeroQuery, { target }),
        target,
        transport: "zero-query",
      },
      queryListArtists: {
        body: createZeroQueryTransformBody("listArtists", {
          limit: 50,
          search,
        }),
        id: "zero-query-list-artists",
        method: "POST",
        operation: "query",
        path: appendMusicFixtureSearchParams(MUSIC_FIXTURE_API_PATHS.zeroQuery, { target }),
        target,
        transport: "zero-query",
      },
    },
  };
}

export function createMusicFixtureApiPerformanceFixtures(
  options: { readonly target?: MusicFixtureApiTargetId } = {},
) {
  const target = options.target ?? defaultMusicFixtureApiTarget;
  const fixtures = createMusicFixtureApiFixtures({ target });

  return [
    withBenchmarkTarget(fixtures.directMutators.cartAdd, createDbConnectionTarget(target)),
    withBenchmarkTarget(fixtures.zero.mutateCartAdd, createZeroMutationTarget(target)),
    withBenchmarkTarget(fixtures.zql.readArtist, createZqlReadTarget(target)),
  ] as const satisfies readonly ApiPerformanceFixture[];
}

export function createMusicFixtureApiPerformanceFixtureCatalog(
  options: { readonly target?: MusicFixtureApiTargetId } = {},
) {
  const target = options.target ?? defaultMusicFixtureApiTarget;
  const fixtures = createMusicFixtureApiFixtures({ target });

  return [
    withBenchmarkTarget(fixtures.directDrizzle.cartAdd, createDrizzleDirectTarget()),
    withBenchmarkTarget(fixtures.directDrizzle.readArtist, createDrizzleDirectTarget()),
    withBenchmarkTarget(fixtures.directDrizzle.readCartItems, createDrizzleDirectTarget()),
    withBenchmarkTarget(fixtures.directDrizzle.readListArtists, createDrizzleDirectTarget()),
    withBenchmarkTarget(fixtures.directMutators.cartAdd, createDbConnectionTarget(target)),
    withBenchmarkTarget(fixtures.zero.mutateCartAdd, createZeroMutationTarget(target)),
    withBenchmarkTarget(fixtures.zql.readArtist, createZqlReadTarget(target)),
    withBenchmarkTarget(fixtures.zql.readCartItems, createZqlReadTarget(target)),
    withBenchmarkTarget(fixtures.zql.readListArtists, createZqlReadTarget(target)),
    ...(target === defaultMusicFixtureApiTarget
      ? [
          withBenchmarkTarget(fixtures.zero.queryArtist, createZeroQueryTarget()),
          withBenchmarkTarget(fixtures.zero.queryCartItems, createZeroQueryTarget()),
          withBenchmarkTarget(fixtures.zero.queryListArtists, createZeroQueryTarget()),
        ]
      : []),
  ] as const satisfies readonly ApiPerformanceFixture[];
}

export function createMusicFixtureZeroMutateCartAddFixture(
  options: CreateMusicFixtureZeroMutateCartAddFixtureOptions = {},
): ApiRequestFixture {
  const albumId = options.albumId ?? MUSIC_FIXTURE_API_DEFAULTS.albumId;
  const timestamp = options.timestamp ?? MUSIC_FIXTURE_API_DEFAULTS.timestamp;
  const userId = options.userId;

  return createMusicFixtureZeroPushFixture({
    clientGroupID: options.clientGroupID,
    fixtureId: "zero-mutate-cart-add",
    mutations: [
      createMusicFixtureZeroMutation({
        args: {
          ...(userId ? { __benchmarkUserId: userId } : {}),
          addedAt: timestamp,
          albumId,
        },
        clientID: options.clientID,
        mutationID: options.mutationID ?? MUSIC_FIXTURE_API_DEFAULTS.mutationID,
        mutatorName: "cart.add",
        timestamp,
      }),
    ],
    requestID: `req-${options.mutationID ?? MUSIC_FIXTURE_API_DEFAULTS.mutationID}`,
    target: options.target,
    timestamp,
  });
}

export function createMusicFixtureZeroMutateCartRemoveFixture(
  options: CreateMusicFixtureZeroMutateCartAddFixtureOptions = {},
): ApiRequestFixture {
  const albumId = options.albumId ?? MUSIC_FIXTURE_API_DEFAULTS.albumId;
  const timestamp = options.timestamp ?? MUSIC_FIXTURE_API_DEFAULTS.timestamp;
  const userId = options.userId;

  return createMusicFixtureZeroPushFixture({
    clientGroupID: options.clientGroupID,
    fixtureId: "zero-mutate-cart-remove",
    mutations: [
      createMusicFixtureZeroMutation({
        args: {
          ...(userId ? { __benchmarkUserId: userId } : {}),
          albumId,
        },
        clientID: options.clientID,
        mutationID: options.mutationID ?? MUSIC_FIXTURE_API_DEFAULTS.mutationID,
        mutatorName: "cart.remove",
        timestamp,
      }),
    ],
    requestID: `req-${options.mutationID ?? MUSIC_FIXTURE_API_DEFAULTS.mutationID}`,
    target: options.target,
    timestamp,
  });
}

export function createMusicFixtureZeroMutation(
  options: CreateMusicFixtureZeroMutationOptions,
): MusicFixtureZeroMutation {
  return {
    args: [options.args ?? {}],
    clientID: options.clientID ?? MUSIC_FIXTURE_API_DEFAULTS.clientID,
    id: options.mutationID,
    name: options.mutatorName,
    timestamp: options.timestamp ?? MUSIC_FIXTURE_API_DEFAULTS.timestamp,
    type: "custom",
  };
}

export function createMusicFixtureZeroPushFixture(
  options: CreateMusicFixtureZeroPushFixtureOptions,
): ApiRequestFixture {
  const target = options.target ?? defaultMusicFixtureApiTarget;
  const timestamp =
    options.timestamp ??
    options.mutations[options.mutations.length - 1]?.timestamp ??
    MUSIC_FIXTURE_API_DEFAULTS.timestamp;

  const body = {
    clientGroupID: options.clientGroupID ?? MUSIC_FIXTURE_API_DEFAULTS.clientGroupID,
    mutations: options.mutations,
    pushVersion: 1,
    requestID:
      options.requestID ?? `req-${options.mutations.map((mutation) => mutation.id).join("-")}`,
    schemaVersion: 1,
    timestamp,
  } satisfies MusicFixtureZeroPushBody;

  return {
    body,
    id: options.fixtureId ?? "zero-mutate",
    method: "POST",
    operation: "mutation",
    path: appendMusicFixtureSearchParams(MUSIC_FIXTURE_API_PATHS.zeroMutate, {
      appID: MUSIC_FIXTURE_ZERO_APP_ID,
      schema: ZERO_CONTROL_SCHEMA,
      target,
    }),
    target,
    transport: "zero-mutate",
  };
}

function appendMusicFixtureSearchParams(
  path: string,
  params: Record<string, JsonPrimitive | undefined>,
) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }

    searchParams.set(key, String(value));
  }

  const query = searchParams.toString();
  return query ? `${path}?${query}` : path;
}

function createDbConnectionTarget(targetId: MusicFixtureApiTargetId) {
  const target = getMusicFixtureApiTargetSpec(targetId);

  if (target.runtime === "control") {
    return {
      benchmarkEffectLine: "none" as const,
      benchmarkLayer: "dbconnection" as const,
      benchmarkTargetId: "control-dbconnection",
      benchmarkTargetLabel: "Control DBConnection via zeroPostgresJS",
    };
  }

  const suffix = benchmarkSuffix(target);

  return {
    benchmarkEffectLine: target.runtime,
    benchmarkLayer: "dbconnection" as const,
    benchmarkTargetId: `effect-${target.runtime}-dbconnection${suffix}`,
    benchmarkTargetLabel: `Effect ${target.runtime} DBConnection (${target.adapter})`,
  };
}

function createDrizzleDirectTarget() {
  return {
    benchmarkEffectLine: "none" as const,
    benchmarkLayer: "drizzle-direct" as const,
    benchmarkTargetId: "drizzle-direct",
    benchmarkTargetLabel: "Drizzle direct await",
  };
}

function createZeroMutationTarget(targetId: MusicFixtureApiTargetId) {
  const target = getMusicFixtureApiTargetSpec(targetId);

  if (target.runtime === "control") {
    return {
      benchmarkEffectLine: "none" as const,
      benchmarkLayer: "zero-mutation-layer" as const,
      benchmarkTargetId: "zero-mutation-layer-control",
      benchmarkTargetLabel: "Zero mutation layer via zeroPostgresJS",
    };
  }

  const suffix = benchmarkSuffix(target);

  return {
    benchmarkEffectLine: target.runtime,
    benchmarkLayer: "zero-mutation-layer" as const,
    benchmarkTargetId: `zero-mutation-layer-${target.runtime}${suffix}`,
    benchmarkTargetLabel: `Zero mutation layer via Effect ${target.runtime} (${target.adapter})`,
  };
}

function createZeroQueryTarget() {
  return {
    benchmarkEffectLine: "none" as const,
    benchmarkLayer: "zero-query-layer" as const,
    benchmarkTargetId: "zero-query-transform",
    benchmarkTargetLabel: "Zero query transform (adapter-independent)",
  };
}

function createZqlReadTarget(targetId: MusicFixtureApiTargetId) {
  const target = getMusicFixtureApiTargetSpec(targetId);

  if (target.runtime === "control") {
    return {
      benchmarkEffectLine: "none" as const,
      benchmarkLayer: "zql-read-layer" as const,
      benchmarkTargetId: "zql-read-layer-control",
      benchmarkTargetLabel: "ZQL read layer via zeroPostgresJS",
    };
  }

  const suffix = benchmarkSuffix(target);

  return {
    benchmarkEffectLine: target.runtime,
    benchmarkLayer: "zql-read-layer" as const,
    benchmarkTargetId: `zql-read-layer-${target.runtime}${suffix}`,
    benchmarkTargetLabel: `ZQL read layer via Effect ${target.runtime} (${target.adapter})`,
  };
}

function createZeroQueryTransformBody(
  name: string,
  args: Record<string, ReadonlyJSONValue>,
): ReadonlyJSONValue {
  return [
    "transform",
    [
      {
        args: [args],
        id: `query-${kebabCase(name)}`,
        name,
      },
    ],
  ] as const as ReadonlyJSONValue;
}

function kebabCase(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replaceAll("_", "-")
    .toLowerCase();
}

function benchmarkSuffix(target: MusicFixtureApiTargetSpec) {
  return target.adapter === "drizzle" ? "" : `-${target.adapter}`;
}

function withBenchmarkTarget(
  fixture: ApiRequestFixture,
  benchmarkTarget: Pick<
    ApiPerformanceFixture,
    "benchmarkEffectLine" | "benchmarkLayer" | "benchmarkTargetId" | "benchmarkTargetLabel"
  >,
): ApiPerformanceFixture {
  return {
    ...fixture,
    ...benchmarkTarget,
  };
}

function isMusicFixtureApiTarget(value: string | undefined): value is MusicFixtureApiTargetId {
  return value !== undefined && musicFixtureApiTargetIdSet.has(value);
}

function isMusicFixtureMutatorName(value: string): value is MusicFixtureMutatorName {
  return musicFixtureMutatorNameSet.has(value);
}
