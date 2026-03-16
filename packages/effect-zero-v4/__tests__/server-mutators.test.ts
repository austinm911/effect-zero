import {
  createMusicFixtureZeroMutateCartAddFixture,
  createMusicFixtureZeroMutateCartRemoveFixture,
  type MusicFixtureZeroPushBody,
} from "@effect-zero/test-utils/api-fixtures";
import {
  createTestDatabase,
  type TestDatabase,
  ZERO_CONTROL_SCHEMA,
} from "@effect-zero/test-utils/postgres-test-db";
import {
  cartMutatorDefinitions,
  mutators as baseMutators,
} from "@effect-zero/example-data/mutators";
import { defineMutators } from "@rocicorp/zero";
import { handleMutateRequest } from "@rocicorp/zero/server";
import { Effect, Layer, ServiceMap } from "effect";
import { afterEach, describe, expect, test } from "vite-plus/test";
import {
  createRestMutatorHandler,
  createServerMutatorHandler,
  extendServerMutator,
} from "../src/server.js";
import { createZeroDbProvider } from "../src/server/adapters/drizzle.js";
import * as drizzleSchema from "@effect-zero/example-data/db";
import { schema as zeroSchema } from "@effect-zero/example-data/zero";

describe("Effect v4 server mutator helpers", () => {
  let testDatabase: TestDatabase | undefined;

  afterEach(async () => {
    await testDatabase?.dispose();
    testDatabase = undefined;
  });

  test("composes a shared mutator with a v4 ServiceMap-backed server override and deferred post-commit work", async () => {
    testDatabase = await createTestDatabase({
      databaseNamePrefix: "effect_zero_v4_server_mutators",
    });
    const seed = await testDatabase.seedBaseMusicRows();
    await testDatabase.ensureZeroControlTables();

    const provider = await createZeroDbProvider({
      connectionString: testDatabase.connectionString,
      drizzleSchema,
      zeroSchema,
    });
    const events: string[] = [];

    class CartMutationWorkflow extends ServiceMap.Service<
      CartMutationWorkflow,
      {
        readonly plan: (input: {
          readonly albumId: string;
          readonly userId: string;
        }) => Effect.Effect<{
          readonly afterCommit: ReadonlyArray<Effect.Effect<void>>;
        }>;
      }
    >()("test/CartMutationWorkflow") {
      static readonly layer = Layer.succeed(this)({
        plan: (input) =>
          Effect.sync(() => {
            events.push(`service:${input.albumId}`);

            return {
              afterCommit: [
                Effect.tryPromise(async () => {
                  const rows = await testDatabase!.queryRows<{ count: number }>(
                    `
                      SELECT count(*)::int AS count
                      FROM cart_item
                      WHERE user_id = $1
                        AND album_id = $2
                    `,
                    [input.userId, input.albumId],
                  );

                  events.push(`afterCommit:${rows[0]?.count ?? 0}`);
                }),
              ] as const,
            };
          }),
      });
    }

    const serverMutators = defineMutators(baseMutators, {
      cart: {
        add: extendServerMutator(cartMutatorDefinitions.add, (input) => {
          const ctx = input.ctx;

          if (!ctx) {
            return Effect.fail(new Error("Missing demo context"));
          }

          return Effect.gen(function* () {
            yield* input.runDefaultMutation();

            const rows = yield* Effect.tryPromise(() =>
              input.tx.dbTransaction.query(
                `
                  SELECT count(*)::int AS count
                  FROM cart_item
                  WHERE user_id = $1
                    AND album_id = $2
                `,
                [ctx.userId, input.args.albumId],
              ),
            );

            events.push(
              `inTransaction:${Number((Array.from(rows)[0] as { count?: unknown })?.count ?? 0)}`,
            );

            const workflow = yield* CartMutationWorkflow;
            const result = yield* workflow.plan({
              albumId: input.args.albumId,
              userId: ctx.userId,
            });

            for (const effect of result.afterCommit) {
              input.defer(effect);
            }
          });
        }),
      },
    });

    const handler = createServerMutatorHandler({
      getContext: () => ({ userId: seed.userId }),
      mutators: serverMutators,
      executeEffect: ({ effect }) =>
        Effect.runPromise(
          Effect.provide(effect, CartMutationWorkflow.layer) as Effect.Effect<any, any, never>,
        ),
    });

    try {
      const addFixture = createMusicFixtureZeroMutateCartAddFixture({
        albumId: seed.album.id,
        userId: seed.userId,
      });
      const addBody = getZeroPushBody(addFixture.body);
      const addMutation = getOnlyZeroMutation(addBody);

      const response = await handleMutateRequest(
        provider.zql,
        handler,
        createZeroControlQuery(),
        addBody,
      );

      const cartRows = await testDatabase.queryRows<{ albumId: string; userId: string }>(
        `
          SELECT album_id AS "albumId", user_id AS "userId"
          FROM cart_item
          WHERE user_id = $1
            AND album_id = $2
        `,
        [seed.userId, seed.album.id],
      );

      if (!("mutations" in response)) {
        throw new Error(
          `Expected a successful push response, received ${JSON.stringify(response)}`,
        );
      }

      expect(response.mutations).toEqual([
        {
          id: {
            clientID: addMutation.clientID,
            id: addMutation.id,
          },
          result: {},
        },
      ]);
      expect(cartRows).toEqual([
        {
          albumId: seed.album.id,
          userId: seed.userId,
        },
      ]);
      expect(events).toEqual([`inTransaction:1`, `service:${seed.album.id}`, `afterCommit:1`]);
    } finally {
      await provider.dispose();
    }
  }, 20_000);

  test("supports full replacement server overrides without calling runDefaultMutation", async () => {
    testDatabase = await createTestDatabase({
      databaseNamePrefix: "effect_zero_v4_server_mutators",
    });
    const seed = await testDatabase.seedBaseMusicRows();
    await testDatabase.ensureZeroControlTables();
    await testDatabase.queryRows(
      `
        INSERT INTO cart_item (user_id, album_id, added_at)
        VALUES ($1, $2, $3)
      `,
      [seed.userId, seed.album.id, 1_743_127_752_952],
    );

    const provider = await createZeroDbProvider({
      connectionString: testDatabase.connectionString,
      drizzleSchema,
      zeroSchema,
    });

    const serverMutators = defineMutators(baseMutators, {
      cart: {
        remove: extendServerMutator(cartMutatorDefinitions.remove, async ({ args, ctx, tx }) => {
          if (!ctx) {
            throw new Error("Missing demo context");
          }

          await tx.dbTransaction.query(
            `
                DELETE FROM cart_item
                WHERE user_id = $1
                  AND album_id = $2
              `,
            [ctx.userId, args.albumId],
          );
        }),
      },
    });

    const handler = createServerMutatorHandler({
      getContext: () => ({ userId: seed.userId }),
      mutators: serverMutators,
    });

    try {
      const removeFixture = createMusicFixtureZeroMutateCartRemoveFixture({
        albumId: seed.album.id,
      });
      const removeBody = getZeroPushBody(removeFixture.body);
      const removeMutation = getOnlyZeroMutation(removeBody);

      const response = await handleMutateRequest(
        provider.zql,
        handler,
        createZeroControlQuery(),
        removeBody,
      );

      const cartRows = await testDatabase.queryRows<{ albumId: string; userId: string }>(
        `
          SELECT album_id AS "albumId", user_id AS "userId"
          FROM cart_item
          WHERE user_id = $1
            AND album_id = $2
        `,
        [seed.userId, seed.album.id],
      );

      if (!("mutations" in response)) {
        throw new Error(
          `Expected a successful push response, received ${JSON.stringify(response)}`,
        );
      }

      expect(response.mutations).toEqual([
        {
          id: {
            clientID: removeMutation.clientID,
            id: removeMutation.id,
          },
          result: {},
        },
      ]);
      expect(cartRows).toEqual([]);
    } finally {
      await provider.dispose();
    }
  }, 20_000);

  test("runs REST-style mutator calls through the same override and deferred-effect path", async () => {
    testDatabase = await createTestDatabase({
      databaseNamePrefix: "effect_zero_v4_server_mutators",
    });
    const seed = await testDatabase.seedBaseMusicRows();
    await testDatabase.ensureZeroControlTables();

    const provider = await createZeroDbProvider({
      connectionString: testDatabase.connectionString,
      drizzleSchema,
      zeroSchema,
    });
    const events: string[] = [];

    const serverMutators = defineMutators(baseMutators, {
      cart: {
        add: extendServerMutator(cartMutatorDefinitions.add, (input) =>
          Effect.gen(function* () {
            yield* input.runDefaultMutation();
            input.defer(Effect.sync(() => events.push(`afterCommit:${input.args.albumId}`)));
          }),
        ),
      },
    });

    const handler = createRestMutatorHandler({
      getContext: () => ({ userId: seed.userId }),
      mutators: serverMutators,
    });

    try {
      await handler({
        db: provider.zql,
        mutation: {
          args: {
            addedAt: 1_743_127_752_952,
            albumId: seed.album.id,
          },
          name: "cart.add",
        },
      });

      const cartRows = await testDatabase.queryRows<{ albumId: string; userId: string }>(
        `
          SELECT album_id AS "albumId", user_id AS "userId"
          FROM cart_item
          WHERE user_id = $1
            AND album_id = $2
        `,
        [seed.userId, seed.album.id],
      );

      expect(cartRows).toEqual([
        {
          albumId: seed.album.id,
          userId: seed.userId,
        },
      ]);
      expect(events).toEqual([`afterCommit:${seed.album.id}`]);
    } finally {
      await provider.dispose();
    }
  }, 20_000);

  test("rejects server overrides that call runDefaultMutation twice", async () => {
    testDatabase = await createTestDatabase({
      databaseNamePrefix: "effect_zero_v4_server_mutators",
    });
    const seed = await testDatabase.seedBaseMusicRows();
    await testDatabase.ensureZeroControlTables();

    const provider = await createZeroDbProvider({
      connectionString: testDatabase.connectionString,
      drizzleSchema,
      zeroSchema,
    });

    const serverMutators = defineMutators(baseMutators, {
      cart: {
        add: extendServerMutator(cartMutatorDefinitions.add, (input) =>
          Effect.gen(function* () {
            yield* input.runDefaultMutation();
            yield* input.runDefaultMutation();
          }),
        ),
      },
    });

    const handler = createServerMutatorHandler({
      getContext: () => ({ userId: seed.userId }),
      mutators: serverMutators,
    });

    try {
      const addFixture = createMusicFixtureZeroMutateCartAddFixture({
        albumId: seed.album.id,
        userId: seed.userId,
      });
      const addBody = getZeroPushBody(addFixture.body);
      const addMutation = getOnlyZeroMutation(addBody);

      const response = await handleMutateRequest(
        provider.zql,
        handler,
        createZeroControlQuery(),
        addBody,
      );

      const cartRows = await testDatabase.queryRows<{ albumId: string; userId: string }>(
        `
          SELECT album_id AS "albumId", user_id AS "userId"
          FROM cart_item
          WHERE user_id = $1
            AND album_id = $2
        `,
        [seed.userId, seed.album.id],
      );

      expect(response).toEqual({
        mutations: [
          {
            id: {
              clientID: addMutation.clientID,
              id: addMutation.id,
            },
            result: expect.objectContaining({
              error: "app",
            }),
          },
        ],
      });
      expect(cartRows).toEqual([]);
    } finally {
      await provider.dispose();
    }
  }, 20_000);

  test("preserves duplicate replay semantics through the v4 transaction bridge", async () => {
    testDatabase = await createTestDatabase({
      databaseNamePrefix: "effect_zero_v4_server_mutators",
    });
    const seed = await testDatabase.seedBaseMusicRows();
    await testDatabase.ensureZeroControlTables();

    const provider = await createZeroDbProvider({
      connectionString: testDatabase.connectionString,
      drizzleSchema,
      zeroSchema,
    });
    const handler = createServerMutatorHandler({
      getContext: () => ({ userId: seed.userId }),
      mutators: baseMutators,
    });

    try {
      const addFixture = createMusicFixtureZeroMutateCartAddFixture({
        albumId: seed.album.id,
        userId: seed.userId,
      });
      const addBody = getZeroPushBody(addFixture.body);
      const addMutation = getOnlyZeroMutation(addBody);

      const firstResponse = await handleMutateRequest(
        provider.zql,
        handler,
        createZeroControlQuery(),
        addBody,
      );
      const replayResponse = await handleMutateRequest(
        provider.zql,
        handler,
        createZeroControlQuery(),
        addBody,
      );
      const clientRows = await testDatabase.queryRows<{ lastMutationID: number }>(
        `
          SELECT "lastMutationID"::int AS "lastMutationID"
          FROM ${ZERO_CONTROL_SCHEMA}."clients"
          WHERE "clientGroupID" = $1
            AND "clientID" = $2
        `,
        [addBody.clientGroupID, addMutation.clientID],
      );

      expect(firstResponse).toEqual({
        mutations: [
          {
            id: {
              clientID: addMutation.clientID,
              id: addMutation.id,
            },
            result: {},
          },
        ],
      });
      expect(replayResponse).toEqual({
        mutations: [
          {
            id: {
              clientID: addMutation.clientID,
              id: addMutation.id,
            },
            result: {
              details: `Ignoring mutation from ${addMutation.clientID} with ID ${addMutation.id} as it was already processed. Expected: 2`,
              error: "alreadyProcessed",
            },
          },
        ],
      });
      expect(clientRows).toEqual([{ lastMutationID: 1 }]);
    } finally {
      await provider.dispose();
    }
  }, 20_000);

  test("preserves out-of-order push failures through the v4 transaction bridge", async () => {
    testDatabase = await createTestDatabase({
      databaseNamePrefix: "effect_zero_v4_server_mutators",
    });
    const seed = await testDatabase.seedBaseMusicRows();
    await testDatabase.ensureZeroControlTables();

    const provider = await createZeroDbProvider({
      connectionString: testDatabase.connectionString,
      drizzleSchema,
      zeroSchema,
    });
    const handler = createServerMutatorHandler({
      getContext: () => ({ userId: seed.userId }),
      mutators: baseMutators,
    });

    try {
      const addFixture = createMusicFixtureZeroMutateCartAddFixture({
        albumId: seed.album.id,
        mutationID: 2,
        userId: seed.userId,
      });
      const addBody = getZeroPushBody(addFixture.body);
      const addMutation = getOnlyZeroMutation(addBody);

      const response = await handleMutateRequest(
        provider.zql,
        handler,
        createZeroControlQuery(),
        addBody,
      );

      expect(response).toEqual({
        kind: "PushFailed",
        message: `Client ${addMutation.clientID} sent mutation ID 2 but expected 1`,
        mutationIDs: [
          {
            clientID: addMutation.clientID,
            id: 2,
          },
        ],
        origin: "server",
        reason: "oooMutation",
      });
    } finally {
      await provider.dispose();
    }
  }, 20_000);
});

function createZeroControlQuery() {
  return new URLSearchParams({
    appID: "effect-zero-test",
    schema: ZERO_CONTROL_SCHEMA,
  });
}

function getZeroPushBody(body: unknown): MusicFixtureZeroPushBody {
  const pushBody = body as MusicFixtureZeroPushBody | undefined;

  if (!pushBody?.mutations || pushBody.mutations.length === 0) {
    throw new Error(`Expected a Zero push body, received ${JSON.stringify(body)}`);
  }

  return pushBody;
}

function getOnlyZeroMutation(body: unknown) {
  const mutations = getZeroPushBody(body).mutations;

  if (!mutations || mutations.length !== 1 || !mutations[0]) {
    throw new Error(`Expected exactly one Zero mutation, received ${JSON.stringify(body)}`);
  }

  return mutations[0];
}
