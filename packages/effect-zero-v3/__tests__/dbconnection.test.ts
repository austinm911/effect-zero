import { builder as zeroBuilder, schema as zeroSchema } from "@effect-zero/example-data/zero";
import { createMusicFixtureApiFixtures } from "@effect-zero/test-utils/api-fixtures";
import {
  createTestDatabase,
  type TestDatabase,
  ZERO_CONTROL_SCHEMA,
} from "@effect-zero/test-utils/postgres-test-db";
import { sql } from "drizzle-orm";
import { Effect } from "effect";
import { Pool } from "pg";
import postgres from "postgres";
import { afterEach, describe, expect, test } from "vite-plus/test";
import { handleMutateRequest, handleQueryRequest, ZQLDatabase } from "@rocicorp/zero/server";
import {
  createDbConnection,
  createZeroDbProvider,
  toIterableRows,
} from "../src/server/adapters/drizzle.js";
import { zeroEffectNodePg } from "../src/server/adapters/pg.js";
import { zeroEffectPostgresJS } from "../src/server/adapters/postgresjs.js";
import * as drizzleSchema from "@effect-zero/example-data/db";

const mockTransactionInput = {
  clientGroupID: "cg1",
  clientID: "c1",
  mutationID: 1,
  upstreamSchema: ZERO_CONTROL_SCHEMA,
} as const;

describe("toIterableRows", () => {
  test("passes through arrays", () => {
    const rows = [{ id: "artist_portishead" }];

    expect(toIterableRows(rows)).toBe(rows);
  });

  test("extracts rows from query result objects", () => {
    const rows = [{ id: "artist_portishead" }];

    expect(toIterableRows({ rows })).toBe(rows);
  });

  test("throws for non-iterable results", () => {
    expect(() => toIterableRows(Symbol("not-iterable"))).toThrow(
      /Drizzle query result is not iterable/,
    );
  });
});

describe("Effect v3 DBConnection", () => {
  let testDatabase: TestDatabase | undefined;

  afterEach(async () => {
    await testDatabase?.dispose();
    testDatabase = undefined;
  });

  test("supports Zero ZQL reads, raw SQL, and native Effect Drizzle transaction access", async () => {
    testDatabase = await createTestDatabase({
      databaseNamePrefix: "effect_zero_v3",
    });
    const seed = await testDatabase.seedBaseMusicRows();
    const connection = await createDbConnection({
      connectionString: testDatabase.connectionString,
      drizzleSchema,
    });

    try {
      const zql = new ZQLDatabase(connection, zeroSchema);

      const resultZql = await zql.run(zeroBuilder.artist.where("id", "=", seed.artist.id));
      const resultRaw = await zql.transaction(
        (tx) => tx.dbTransaction.query('SELECT * FROM "artist" WHERE id = $1', [seed.artist.id]),
        mockTransactionInput,
      );
      const resultDrizzle = await zql.transaction(
        (tx) =>
          Effect.runPromise(
            tx.dbTransaction.wrappedTransaction.query.artist
              .findFirst({
                where: {
                  id: seed.artist.id,
                } as never,
              })
              .execute(),
          ),
        mockTransactionInput,
      );

      expect(resultZql[0]?.id).toBe(seed.artist.id);
      expect(resultZql[0]?.name).toBe(seed.artist.name);
      expect(Array.from(resultRaw)).toEqual([
        expect.objectContaining({
          id: seed.artist.id,
          name: seed.artist.name,
        }),
      ]);
      expect(resultDrizzle?.id).toBe(seed.artist.id);
      expect(resultDrizzle?.name).toBe(seed.artist.name);
    } finally {
      await connection.dispose();
    }
  }, 20_000);

  test("runs handleMutateRequest through a Zero provider backed by the Effect v3 adapter", async () => {
    testDatabase = await createTestDatabase({
      databaseNamePrefix: "effect_zero_v3",
    });
    const seed = await testDatabase.seedBaseMusicRows();
    await testDatabase.ensureZeroControlTables();

    const provider = await createZeroDbProvider({
      connectionString: testDatabase.connectionString,
      drizzleSchema,
      zeroSchema,
    });

    try {
      const response = await handleMutateRequest(
        provider.zql,
        async (transact) =>
          transact(async (tx, name, args) => {
            expect(name).toBe("cart.add");

            const input = args as { readonly addedAt: number; readonly albumId: string };

            await tx.mutate.cartItem.upsert({
              addedAt: input.addedAt,
              albumId: input.albumId,
              userId: seed.userId,
            });
          }),
        {
          appID: "effect-zero-test",
          schema: ZERO_CONTROL_SCHEMA,
        },
        {
          clientGroupID: mockTransactionInput.clientGroupID,
          mutations: [
            {
              args: [{ addedAt: 1_743_127_752_952, albumId: seed.album.id }],
              clientID: mockTransactionInput.clientID,
              id: mockTransactionInput.mutationID,
              name: "cart.add",
              timestamp: 1_743_127_752_952,
              type: "custom",
            },
          ],
          pushVersion: 1,
          requestID: "req1",
          schemaVersion: 1,
          timestamp: 1_743_127_752_952,
        },
      );

      const cartItems = await provider.zql.run(
        zeroBuilder.cartItem.where("userId", "=", seed.userId).where("albumId", "=", seed.album.id),
      );
      const zeroClients = await testDatabase.queryRows<{
        clientGroupID: string;
        clientID: string;
        lastMutationID: number;
      }>(
        `
          SELECT
            "clientGroupID" AS "clientGroupID",
            "clientID" AS "clientID",
            "lastMutationID"::int AS "lastMutationID"
          FROM ${ZERO_CONTROL_SCHEMA}."clients"
          `,
      );

      if (!("mutations" in response)) {
        throw new Error(`Expected a push success response, received ${JSON.stringify(response)}`);
      }

      expect(response.mutations).toEqual([
        {
          id: {
            clientID: mockTransactionInput.clientID,
            id: mockTransactionInput.mutationID,
          },
          result: {},
        },
      ]);
      expect(cartItems).toEqual([
        expect.objectContaining({
          albumId: seed.album.id,
          userId: seed.userId,
        }),
      ]);
      expect(zeroClients).toEqual([
        {
          clientGroupID: mockTransactionInput.clientGroupID,
          clientID: mockTransactionInput.clientID,
          lastMutationID: mockTransactionInput.mutationID,
        },
      ]);
    } finally {
      await provider.dispose();
    }
  }, 20_000);

  test("accepts a caller-owned Drizzle database in createZeroDbProvider", async () => {
    testDatabase = await createTestDatabase({
      databaseNamePrefix: "effect_zero_v3",
    });
    const seed = await testDatabase.seedBaseMusicRows();
    const ownedConnection = await createDbConnection({
      connectionString: testDatabase.connectionString,
      drizzleSchema,
    });

    const provider = await createZeroDbProvider({
      db: ownedConnection.drizzle,
      zeroSchema,
    });

    try {
      expect(provider.connection.drizzle).toBe(ownedConnection.drizzle);

      await provider.dispose();

      const result = await provider.zql.run(
        zeroBuilder.artist.where("id", "=", seed.artist.id),
      );

      expect(result[0]?.id).toBe(seed.artist.id);
      expect(result[0]?.name).toBe(seed.artist.name);
    } finally {
      await ownedConnection.dispose();
    }
  }, 20_000);

  test("runs handleQueryRequest for the shared artist query fixture", async () => {
    testDatabase = await createTestDatabase({
      databaseNamePrefix: "effect_zero_v3",
    });
    const seed = await testDatabase.seedBaseMusicRows();
    const fixtures = createMusicFixtureApiFixtures({
      artistId: seed.artist.id,
    });
    const request = new Request("https://example.com/api/zero/query", {
      body: JSON.stringify(fixtures.zero.queryArtist.body),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    });

    const calls: Array<{ args: unknown; name: string }> = [];
    const response = await handleQueryRequest(
      (name, args) => {
        calls.push({ args, name });

        if (name !== "getArtist") {
          throw new Error(`Unexpected query name: ${name}`);
        }

        return zeroBuilder.artist.where(
          "id",
          "=",
          (args as { artistId?: string } | undefined)?.artistId ?? "",
        );
      },
      zeroSchema,
      request,
    );

    expect(calls).toEqual([
      {
        args: {
          artistId: seed.artist.id,
        },
        name: "getArtist",
      },
    ]);
    expect(response).toEqual([
      "transformed",
      [
        expect.objectContaining({
          ast: expect.objectContaining({
            table: "artist",
          }),
          id: "query-get-artist",
          name: "getArtist",
        }),
      ],
    ]);
  }, 20_000);

  test("wraps a node-postgres pool with raw SQL and native client transaction access", async () => {
    testDatabase = await createTestDatabase({
      databaseNamePrefix: "effect_zero_v3_pg",
    });
    const seed = await testDatabase.seedBaseMusicRows();
    const pool = new Pool({ connectionString: testDatabase.connectionString });
    const provider = zeroEffectNodePg(zeroSchema, pool);

    try {
      const resultZql = await provider.zql.run(zeroBuilder.artist.where("id", "=", seed.artist.id));
      const resultRaw = await provider.zql.transaction(
        (tx) => tx.dbTransaction.query('SELECT * FROM "artist" WHERE id = $1', [seed.artist.id]),
        mockTransactionInput,
      );
      const resultPg = await provider.zql.transaction(
        (tx) =>
          tx.dbTransaction.wrappedTransaction.query(
            'SELECT id, name FROM "artist" WHERE id = $1',
            [seed.artist.id],
          ),
        mockTransactionInput,
      );

      expect(resultZql[0]?.id).toBe(seed.artist.id);
      expect(Array.from(resultRaw)).toEqual([
        expect.objectContaining({
          id: seed.artist.id,
          name: seed.artist.name,
        }),
      ]);
      expect(resultPg.rows).toEqual([
        expect.objectContaining({
          id: seed.artist.id,
          name: seed.artist.name,
        }),
      ]);
    } finally {
      await provider.dispose();
      await pool.end();
    }
  }, 20_000);

  test("wraps a postgres.js client with raw SQL and tagged-template transaction access", async () => {
    testDatabase = await createTestDatabase({
      databaseNamePrefix: "effect_zero_v3_postgresjs",
    });
    const seed = await testDatabase.seedBaseMusicRows();
    const sqlClient = postgres(testDatabase.connectionString, { max: 1, prepare: false });
    const provider = zeroEffectPostgresJS(zeroSchema, sqlClient);

    try {
      const resultZql = await provider.zql.run(zeroBuilder.artist.where("id", "=", seed.artist.id));
      const resultRaw = await provider.zql.transaction(
        (tx) => tx.dbTransaction.query('SELECT * FROM "artist" WHERE id = $1', [seed.artist.id]),
        mockTransactionInput,
      );
      const resultPostgres = await provider.zql.transaction(
        (tx) =>
          tx.dbTransaction.wrappedTransaction`
            SELECT id, name
            FROM "artist"
            WHERE id = ${seed.artist.id}
          `,
        mockTransactionInput,
      );

      expect(resultZql[0]?.id).toBe(seed.artist.id);
      expect(Array.from(resultRaw)).toEqual([
        expect.objectContaining({
          id: seed.artist.id,
          name: seed.artist.name,
        }),
      ]);
      expect(resultPostgres).toEqual([
        expect.objectContaining({
          id: seed.artist.id,
          name: seed.artist.name,
        }),
      ]);
    } finally {
      await provider.dispose();
      await sqlClient.end({ timeout: 0 });
    }
  }, 20_000);

  test("exposes the native Effect Drizzle client for direct writes", async () => {
    testDatabase = await createTestDatabase({
      databaseNamePrefix: "effect_zero_v3",
    });
    const seed = await testDatabase.seedBaseMusicRows();
    const connection = await createDbConnection({
      connectionString: testDatabase.connectionString,
      drizzleSchema,
    });

    try {
      await Effect.runPromise(
        connection.drizzle
          .execute(sql`
            INSERT INTO album (id, artist_id, title, year)
            VALUES ('album_live_roseland', ${seed.artist.id}, 'Roseland NYC Live', 1998)
          `)
          .execute(),
      );

      const rows = await testDatabase.queryRows<{ id: string; title: string }>(
        'SELECT id, title FROM "album" WHERE id = $1',
        ["album_live_roseland"],
      );

      expect(rows).toEqual([
        {
          id: "album_live_roseland",
          title: "Roseland NYC Live",
        },
      ]);
    } finally {
      await connection.dispose();
    }
  }, 20_000);
});
