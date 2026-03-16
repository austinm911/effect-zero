import { randomUUID } from "node:crypto";
import { Client } from "pg";

const defaultPgConfig = {
  database: process.env.EFFECT_ZERO_TEST_ADMIN_DATABASE?.trim() || "postgres",
  host: process.env.EFFECT_ZERO_PG_HOST?.trim() || "127.0.0.1",
  password: process.env.EFFECT_ZERO_PG_PASSWORD?.trim() || "postgres",
  port: Number.parseInt(process.env.EFFECT_ZERO_PG_PORT?.trim() || "5438", 10),
  user: process.env.EFFECT_ZERO_PG_USER?.trim() || "postgres",
} as const;

export const ZERO_CONTROL_SCHEMA = "zero_0";

/**
 * DDL for the music-fixture schema.
 * Matches the Drizzle schema in @effect-zero/example-data/db.
 * Applied directly — no migration engine needed.
 */
const fixtureSchemaSQL = `
  CREATE TABLE IF NOT EXISTS "artist" (
    "id" varchar PRIMARY KEY NOT NULL,
    "name" varchar NOT NULL,
    "sort_name" varchar NOT NULL,
    "type" varchar,
    "popularity" integer
  );

  CREATE TABLE IF NOT EXISTS "album" (
    "id" varchar PRIMARY KEY NOT NULL,
    "artist_id" varchar NOT NULL REFERENCES "artist"("id") ON DELETE CASCADE,
    "title" varchar NOT NULL,
    "year" integer
  );

  CREATE TABLE IF NOT EXISTS "cart_item" (
    "user_id" varchar NOT NULL,
    "album_id" varchar NOT NULL REFERENCES "album"("id") ON DELETE CASCADE,
    "added_at" bigint NOT NULL,
    CONSTRAINT "cart_item_user_id_album_id_pk" PRIMARY KEY("user_id", "album_id")
  );

  CREATE INDEX IF NOT EXISTS "artist_name_idx" ON "artist" USING btree ("name");
  CREATE INDEX IF NOT EXISTS "artist_popularity_idx" ON "artist" USING btree ("popularity");
  CREATE INDEX IF NOT EXISTS "album_artist_id_idx" ON "album" USING btree ("artist_id");
  CREATE INDEX IF NOT EXISTS "cart_item_user_id_idx" ON "cart_item" USING btree ("user_id");
  CREATE INDEX IF NOT EXISTS "cart_item_album_id_idx" ON "cart_item" USING btree ("album_id");
`;

const ensureZeroControlTablesSql = `
  CREATE SCHEMA IF NOT EXISTS ${ZERO_CONTROL_SCHEMA};

  CREATE TABLE IF NOT EXISTS ${ZERO_CONTROL_SCHEMA}."clients" (
    "clientGroupID" TEXT NOT NULL,
    "clientID" TEXT NOT NULL,
    "lastMutationID" BIGINT NOT NULL,
    "userID" TEXT,
    PRIMARY KEY ("clientGroupID", "clientID")
  );

  CREATE TABLE IF NOT EXISTS ${ZERO_CONTROL_SCHEMA}."mutations" (
    "clientGroupID" TEXT NOT NULL,
    "clientID" TEXT NOT NULL,
    "mutationID" BIGINT NOT NULL,
    "result" JSON NOT NULL,
    PRIMARY KEY ("clientGroupID", "clientID", "mutationID")
  );
`;

export interface MusicFixtureSeed {
  readonly album: {
    readonly artistId: string;
    readonly id: string;
    readonly title: string;
    readonly year: number;
  };
  readonly artist: {
    readonly id: string;
    readonly name: string;
    readonly popularity: number;
    readonly sortName: string;
    readonly type: string;
  };
  readonly userId: string;
}

export interface TestDatabase {
  readonly connectionString: string;
  readonly databaseName: string;
  ensureZeroControlTables(): Promise<void>;
  queryRows<TRow extends Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<TRow[]>;
  seedBaseMusicRows(seed?: MusicFixtureSeed): Promise<MusicFixtureSeed>;
  dispose(): Promise<void>;
}

export interface CreateTestDatabaseOptions {
  readonly databaseNamePrefix?: string;
}

export function createMusicFixtureSeed(): MusicFixtureSeed {
  return {
    album: {
      artistId: "artist_portishead",
      id: "album_dummy",
      title: "Dummy",
      year: 1994,
    },
    artist: {
      id: "artist_portishead",
      name: "Portishead",
      popularity: 99,
      sortName: "Portishead",
      type: "group",
    },
    userId: "user_demo",
  };
}

export async function createTestDatabase(
  options: CreateTestDatabaseOptions = {},
): Promise<TestDatabase> {
  const databaseName = `${options.databaseNamePrefix ?? "effect_zero_test"}_${randomUUID().replaceAll("-", "_")}`;
  const adminClient = new Client({
    database: defaultPgConfig.database,
    host: defaultPgConfig.host,
    password: defaultPgConfig.password,
    port: defaultPgConfig.port,
    user: defaultPgConfig.user,
  });

  await adminClient.connect();

  try {
    await adminClient.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
  } finally {
    await adminClient.end();
  }

  const databaseClient = new Client({
    database: databaseName,
    host: defaultPgConfig.host,
    password: defaultPgConfig.password,
    port: defaultPgConfig.port,
    user: defaultPgConfig.user,
  });

  await databaseClient.connect();
  await databaseClient.query(fixtureSchemaSQL);

  let disposed = false;

  return {
    connectionString: createConnectionString(databaseName),
    databaseName,

    async ensureZeroControlTables() {
      await databaseClient.query(ensureZeroControlTablesSql);
    },

    async queryRows<TRow extends Record<string, unknown>>(
      sql: string,
      params?: readonly unknown[],
    ) {
      const result = await databaseClient.query(sql, params as unknown[] | undefined);
      return result.rows as unknown as TRow[];
    },

    async seedBaseMusicRows(seed = createMusicFixtureSeed()) {
      await databaseClient.query(
        `
          INSERT INTO artist (id, name, sort_name, type, popularity)
          VALUES ($1, $2, $3, $4, $5)
        `,
        [
          seed.artist.id,
          seed.artist.name,
          seed.artist.sortName,
          seed.artist.type,
          seed.artist.popularity,
        ],
      );

      await databaseClient.query(
        `
          INSERT INTO album (id, artist_id, title, year)
          VALUES ($1, $2, $3, $4)
        `,
        [seed.album.id, seed.album.artistId, seed.album.title, seed.album.year],
      );

      return seed;
    },

    async dispose() {
      if (disposed) {
        return;
      }

      disposed = true;
      await databaseClient.end();

      const cleanupClient = new Client({
        database: defaultPgConfig.database,
        host: defaultPgConfig.host,
        password: defaultPgConfig.password,
        port: defaultPgConfig.port,
        user: defaultPgConfig.user,
      });

      await cleanupClient.connect();

      try {
        await cleanupClient.query(
          `
            SELECT pg_terminate_backend(pid)
            FROM pg_stat_activity
            WHERE datname = $1
              AND pid <> pg_backend_pid()
          `,
          [databaseName],
        );
        await cleanupClient.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)}`);
      } finally {
        await cleanupClient.end();
      }
    },
  };
}

function createConnectionString(databaseName: string) {
  return `postgres://${encodeURIComponent(defaultPgConfig.user)}:${encodeURIComponent(defaultPgConfig.password)}@${defaultPgConfig.host}:${defaultPgConfig.port}/${databaseName}`;
}

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}
