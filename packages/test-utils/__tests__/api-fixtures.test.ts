import { expect, test } from "vite-plus/test";
import {
  buildMusicFixtureDemoProtocolStatePath,
  buildMusicFixtureDemoResetPath,
  buildMusicFixtureDemoStatePath,
  buildMusicFixtureMutatorPath,
  buildMusicFixtureTargetPath,
  createMusicFixtureApiFixtures,
  createMusicFixtureApiPerformanceFixtureCatalog,
  createMusicFixtureApiPerformanceFixtures,
  MUSIC_FIXTURE_ZERO_APP_ID,
  createMusicFixtureZeroMutateCartAddFixture,
  createMusicFixtureZeroMutateCartRemoveFixture,
  createMusicFixtureZeroMutation,
  createMusicFixtureZeroPushFixture,
  defaultMusicFixtureApiTarget,
  MUSIC_FIXTURE_API_DEFAULTS,
  MUSIC_FIXTURE_API_PATHS,
  musicFixtureApiBenchmarkTargets,
  musicFixtureApiBrowserTargets,
  musicFixtureApiTargetIds,
  musicFixtureMutatorNames,
  parseMusicFixtureApiTarget,
  parseMusicFixtureMutatorName,
} from "../src/api-fixtures";
import { ZERO_CONTROL_SCHEMA } from "@effect-zero/example-data/server-fixture";

test("music fixture API paths stay stable", () => {
  expect(MUSIC_FIXTURE_API_PATHS).toEqual({
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
  });
});

test("music fixture mutator helpers round-trip path names", () => {
  expect(musicFixtureMutatorNames).toEqual(["cart.add", "cart.remove"]);
  expect(buildMusicFixtureMutatorPath("cart.add")).toBe("/api/mutators/cart/add");
  expect(buildMusicFixtureMutatorPath("cart.add", "v3-drizzle")).toBe(
    "/api/mutators/cart/add?target=v3-drizzle",
  );
  expect(buildMusicFixtureTargetPath()).toBe("/api/target");
  expect(parseMusicFixtureMutatorName("cart/add")).toBe("cart.add");
  expect(parseMusicFixtureMutatorName("/cart/remove/")).toBe("cart.remove");
  expect(parseMusicFixtureMutatorName("cart/unknown")).toBeUndefined();
});

test("music fixture target helpers normalize invalid values back to control", () => {
  expect(musicFixtureApiTargetIds).toEqual([
    "control",
    "v3-drizzle",
    "v3-pg",
    "v3-postgresjs",
    "v4-drizzle",
    "v4-pg",
    "v4-postgresjs",
  ]);
  expect(musicFixtureApiBrowserTargets).toEqual(["control", "v3-drizzle", "v4-drizzle"]);
  expect(musicFixtureApiBenchmarkTargets).toEqual(["control", "v3-drizzle", "v4-drizzle"]);
  expect(defaultMusicFixtureApiTarget).toBe("control");
  expect(parseMusicFixtureApiTarget("v3-drizzle")).toBe("v3-drizzle");
  expect(parseMusicFixtureApiTarget("v4-pg")).toBe("v4-pg");
  expect(parseMusicFixtureApiTarget("")).toBe("control");
  expect(parseMusicFixtureApiTarget("unknown")).toBe("control");
  expect(buildMusicFixtureDemoResetPath("v4-drizzle")).toBe("/api/demo/reset?target=v4-drizzle");
  expect(
    buildMusicFixtureDemoProtocolStatePath({
      clientGroupID: "cg-protocol",
      clientID: "c-protocol",
      target: "v3-postgresjs",
      userId: "bench-user",
    }),
  ).toBe(
    "/api/demo/protocol-state?clientGroupID=cg-protocol&clientID=c-protocol&target=v3-postgresjs&userId=bench-user",
  );
  expect(
    buildMusicFixtureDemoStatePath({
      artistId: MUSIC_FIXTURE_API_DEFAULTS.artistId,
      target: "v3-drizzle",
      search: "Portishead",
    }),
  ).toBe(
    `/api/demo/state?artistId=${MUSIC_FIXTURE_API_DEFAULTS.artistId}&search=Portishead&target=v3-drizzle`,
  );
});

test("music fixture API fixtures define reusable control, mutation, and query requests", () => {
  const fixtures = createMusicFixtureApiFixtures({
    clientGroupID: "cg-test",
    clientID: "c-test",
    mutationID: 7,
    target: "v3-drizzle",
    timestamp: 1_743_127_752_952,
  });

  expect(fixtures.control.reset.path).toBe("/api/demo/reset?target=v3-drizzle");
  expect(fixtures.control.state.method).toBe("GET");
  expect(fixtures.control.target).toEqual({
    body: { target: "v3-drizzle" },
    id: "demo-target",
    method: "POST",
    operation: "control",
    path: "/api/target",
    target: "v3-drizzle",
    transport: "demo",
  });
  expect(fixtures.demoQueries.state.path).toBe(
    `/api/demo/state?artistId=${MUSIC_FIXTURE_API_DEFAULTS.artistId}&target=v3-drizzle`,
  );
  expect(fixtures.directDrizzle.cartAdd.path).toBe("/api/direct/cart/add");
  expect(fixtures.directMutators.cartAdd.path).toBe("/api/mutators/cart/add?target=v3-drizzle");
  expect(fixtures.directMutators.cartAdd.body).toEqual({
    addedAt: 1_743_127_752_952,
    albumId: MUSIC_FIXTURE_API_DEFAULTS.albumId,
  });
  expect(fixtures.zql.readArtist.path).toBe("/api/zql/read?target=v3-drizzle");
  expect(fixtures.zero.mutateCartAdd.path).toBe(
    `/api/zero/mutate?appID=${MUSIC_FIXTURE_ZERO_APP_ID}&schema=${ZERO_CONTROL_SCHEMA}&target=v3-drizzle`,
  );
  expect(fixtures.zero.mutateCartAdd.body).toEqual({
    clientGroupID: "cg-test",
    mutations: [
      {
        args: [
          {
            addedAt: 1_743_127_752_952,
            albumId: MUSIC_FIXTURE_API_DEFAULTS.albumId,
          },
        ],
        clientID: "c-test",
        id: 7,
        name: "cart.add",
        timestamp: 1_743_127_752_952,
        type: "custom",
      },
    ],
    pushVersion: 1,
    requestID: "req-7",
    schemaVersion: 1,
    timestamp: 1_743_127_752_952,
  });
  expect(fixtures.zero.queryArtist.body).toEqual([
    "transform",
    [
      {
        args: [{ artistId: MUSIC_FIXTURE_API_DEFAULTS.artistId }],
        id: "query-get-artist",
        name: "getArtist",
      },
    ],
  ]);
});

test("music fixture performance fixtures expose the target-aware benchmark workloads", () => {
  const fixtures = createMusicFixtureApiPerformanceFixtures({
    target: "v4-drizzle",
  });

  expect(fixtures.map((fixture) => fixture.id)).toEqual([
    "direct-mutator-cart-add",
    "zero-mutate-cart-add",
    "zql-read-artist",
  ]);
  expect(fixtures.map((fixture) => fixture.benchmarkTargetId)).toEqual([
    "effect-v4-dbconnection",
    "zero-mutation-layer-v4",
    "zql-read-layer-v4",
  ]);
  expect(fixtures.map((fixture) => fixture.operation)).toEqual(["mutation", "mutation", "query"]);
});

test("music fixture performance catalog exposes direct, zql, and zero query fixtures", () => {
  const fixtures = createMusicFixtureApiPerformanceFixtureCatalog({
    target: "control",
  });

  expect(fixtures.map((fixture) => fixture.id)).toEqual([
    "drizzle-direct-cart-add",
    "drizzle-direct-read-artist",
    "drizzle-direct-read-cart-items",
    "drizzle-direct-read-list-artists",
    "direct-mutator-cart-add",
    "zero-mutate-cart-add",
    "zql-read-artist",
    "zql-read-cart-items",
    "zql-read-list-artists",
    "zero-query-get-artist",
    "zero-query-get-cart-items",
    "zero-query-list-artists",
  ]);
  expect(fixtures.map((fixture) => fixture.benchmarkTargetId)).toEqual([
    "drizzle-direct",
    "drizzle-direct",
    "drizzle-direct",
    "drizzle-direct",
    "control-dbconnection",
    "zero-mutation-layer-control",
    "zql-read-layer-control",
    "zql-read-layer-control",
    "zql-read-layer-control",
    "zero-query-transform",
    "zero-query-transform",
    "zero-query-transform",
  ]);
});

test("zero mutate fixture builder can generate unique mutation envelopes for runners", () => {
  const fixture = createMusicFixtureZeroMutateCartAddFixture({
    albumId: "album-bitches-brew",
    clientGroupID: "cg-bench",
    clientID: "c-bench-4",
    mutationID: 4,
    target: "v3-pg",
    timestamp: 1_700_000_000_004,
  });

  expect(fixture.id).toBe("zero-mutate-cart-add");
  expect(fixture.path).toBe(
    `/api/zero/mutate?appID=${MUSIC_FIXTURE_ZERO_APP_ID}&schema=${ZERO_CONTROL_SCHEMA}&target=v3-pg`,
  );
  expect(fixture.body).toEqual({
    clientGroupID: "cg-bench",
    mutations: [
      {
        args: [
          {
            addedAt: 1_700_000_000_004,
            albumId: "album-bitches-brew",
          },
        ],
        clientID: "c-bench-4",
        id: 4,
        name: "cart.add",
        timestamp: 1_700_000_000_004,
        type: "custom",
      },
    ],
    pushVersion: 1,
    requestID: "req-4",
    schemaVersion: 1,
    timestamp: 1_700_000_000_004,
  });
});

test("generic zero push fixture builder can compose multi-mutation envelopes", () => {
  const fixture = createMusicFixtureZeroPushFixture({
    clientGroupID: "cg-flow",
    fixtureId: "zero-mutate-flow",
    mutations: [
      createMusicFixtureZeroMutation({
        args: {
          addedAt: 1_700_000_000_010,
          albumId: "album-kind-of-blue",
        },
        clientID: "c-flow",
        mutationID: 1,
        mutatorName: "cart.add",
        timestamp: 1_700_000_000_010,
      }),
      createMusicFixtureZeroMutation({
        args: {
          albumId: "album-kind-of-blue",
        },
        clientID: "c-flow",
        mutationID: 2,
        mutatorName: "cart.remove",
        timestamp: 1_700_000_000_020,
      }),
    ],
    requestID: "req-flow",
    target: "v4-postgresjs",
    timestamp: 1_700_000_000_020,
  });

  expect(fixture).toEqual({
    body: {
      clientGroupID: "cg-flow",
      mutations: [
        {
          args: [
            {
              addedAt: 1_700_000_000_010,
              albumId: "album-kind-of-blue",
            },
          ],
          clientID: "c-flow",
          id: 1,
          name: "cart.add",
          timestamp: 1_700_000_000_010,
          type: "custom",
        },
        {
          args: [
            {
              albumId: "album-kind-of-blue",
            },
          ],
          clientID: "c-flow",
          id: 2,
          name: "cart.remove",
          timestamp: 1_700_000_000_020,
          type: "custom",
        },
      ],
      pushVersion: 1,
      requestID: "req-flow",
      schemaVersion: 1,
      timestamp: 1_700_000_000_020,
    },
    id: "zero-mutate-flow",
    method: "POST",
    operation: "mutation",
    path: `/api/zero/mutate?appID=${MUSIC_FIXTURE_ZERO_APP_ID}&schema=${ZERO_CONTROL_SCHEMA}&target=v4-postgresjs`,
    target: "v4-postgresjs",
    transport: "zero-mutate",
  });
});

test("zero remove helper builds a remove mutation envelope", () => {
  const fixture = createMusicFixtureZeroMutateCartRemoveFixture({
    albumId: "album-in-a-silent-way",
    clientGroupID: "cg-remove",
    clientID: "c-remove",
    mutationID: 9,
    target: "v3-postgresjs",
    timestamp: 1_700_000_000_009,
    userId: "bench-user-remove",
  });

  expect(fixture.body).toEqual({
    clientGroupID: "cg-remove",
    mutations: [
      {
        args: [
          {
            __benchmarkUserId: "bench-user-remove",
            albumId: "album-in-a-silent-way",
          },
        ],
        clientID: "c-remove",
        id: 9,
        name: "cart.remove",
        timestamp: 1_700_000_000_009,
        type: "custom",
      },
    ],
    pushVersion: 1,
    requestID: "req-9",
    schemaVersion: 1,
    timestamp: 1_700_000_000_009,
  });
});
