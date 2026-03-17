import { and, desc, eq, ilike } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { album, artist, cartItem } from "./db/schema.ts";

export const ZERO_CONTROL_SCHEMA = "zero_0";

export const MUSIC_FIXTURE_DEFAULTS = {
  albumId: "48140466-cff6-3222-bd55-63c27e43190d",
  artistId: "8f6bd1e4-fbe1-4f50-aa9b-94c450ec0f11",
  clientGroupID: "cg1",
  clientID: "c1",
  mutationID: 1,
  timestamp: 1_743_127_752_952,
  userId: "demo-user",
} as const;

export type MusicFixtureQueryName = "getArtist" | "getCartItems" | "listArtists";

export interface DirectReadRequest {
  readonly args?: Record<string, unknown>;
  readonly name: MusicFixtureQueryName;
}

export interface MusicFixtureDemoState {
  readonly artists: readonly {
    readonly id: string;
    readonly name: string;
    readonly popularity: number | null;
  }[];
  readonly cartItems: readonly {
    readonly addedAt: number;
    readonly album: {
      readonly artist: {
        readonly id: string;
        readonly name: string;
      };
      readonly id: string;
      readonly title: string;
      readonly year: number | null;
    };
    readonly albumId: string;
    readonly userId: string;
  }[];
  readonly protocol: {
    readonly target: string;
    readonly userId: string;
  };
  readonly search: string;
  readonly selectedArtist: {
    readonly albums: readonly {
      readonly id: string;
      readonly inCart: boolean;
      readonly title: string;
      readonly year: number | null;
    }[];
    readonly id: string;
    readonly name: string;
    readonly popularity: number | null;
  } | null;
}

export interface MusicFixtureProtocolState {
  readonly cartAlbumIds: readonly string[];
  readonly cartItemCount: number;
  readonly target: string;
  readonly userId: string;
  readonly zeroClient: {
    readonly clientGroupID: string;
    readonly clientID: string;
    readonly exists: boolean;
    readonly lastMutationID: number;
    readonly mutationResultCount: number;
    readonly mutationResultIDs: readonly number[];
  } | null;
}

export type QueryRows = <TRow extends Record<string, unknown>>(
  sql: string,
  params?: readonly unknown[],
) => Promise<readonly TRow[]>;

export async function createDirectDrizzleDatabase(connectionString: string) {
  const sql = postgres(connectionString, {
    max: 1,
    prepare: false,
  });

  return {
    db: createDirectDrizzleDatabaseFromSql(sql),
    dispose: () => sql.end({ timeout: 0 }),
    sql,
  };
}

export function createDirectDrizzleDatabaseFromSql(sql: postgres.Sql<Record<string, unknown>>) {
  return drizzle(sql, {
    schema: {
      album,
      artist,
      cartItem,
    },
  });
}

export async function ensureMusicFixtureCatalogPresent(queryRows: QueryRows) {
  const artistRows = await queryRows<{ count: number }>(
    `SELECT count(*)::int AS count FROM artist`,
  );
  const albumRows = await queryRows<{ count: number }>(`SELECT count(*)::int AS count FROM album`);

  if ((artistRows[0]?.count ?? 0) > 0 && (albumRows[0]?.count ?? 0) > 0) {
    return;
  }

  throw new Error(
    "The music fixture catalog is empty. Run `pnpm seed:ztunes` before using demo or verification routes.",
  );
}

export async function ensureZeroControlTables(queryRows: QueryRows) {
  await queryRows(`CREATE SCHEMA IF NOT EXISTS ${ZERO_CONTROL_SCHEMA}`);
  await queryRows(
    `
      CREATE TABLE IF NOT EXISTS ${ZERO_CONTROL_SCHEMA}."clients" (
        "clientGroupID" TEXT NOT NULL,
        "clientID" TEXT NOT NULL,
        "lastMutationID" BIGINT NOT NULL,
        "userID" TEXT,
        PRIMARY KEY ("clientGroupID", "clientID")
      )
    `,
  );
  await queryRows(
    `
      CREATE TABLE IF NOT EXISTS ${ZERO_CONTROL_SCHEMA}."mutations" (
        "clientGroupID" TEXT NOT NULL,
        "clientID" TEXT NOT NULL,
        "mutationID" BIGINT NOT NULL,
        "result" JSON NOT NULL,
        PRIMARY KEY ("clientGroupID", "clientID", "mutationID")
      )
    `,
  );
}

export async function resetMusicFixtureState(queryRows: QueryRows) {
  await ensureMusicFixtureCatalogPresent(queryRows);
  await ensureZeroControlTables(queryRows);
  await queryRows(`TRUNCATE TABLE cart_item`);
  await queryRows(`TRUNCATE TABLE ${ZERO_CONTROL_SCHEMA}."mutations"`);
  await queryRows(`TRUNCATE TABLE ${ZERO_CONTROL_SCHEMA}."clients"`);
}

export async function readMusicFixtureDemoState(
  queryRows: QueryRows,
  options: {
    readonly artistId?: string;
    readonly search?: string;
    readonly target: string;
    readonly userId?: string;
  },
): Promise<MusicFixtureDemoState> {
  const search = options.search?.trim() ?? "";
  const selectedArtistId = options.artistId ?? MUSIC_FIXTURE_DEFAULTS.artistId;
  const userId = options.userId ?? MUSIC_FIXTURE_DEFAULTS.userId;

  const artists = await queryRows<{
    id: string;
    name: string;
    popularity: number | null;
  }>(
    `
      SELECT id, name, popularity
      FROM artist
      WHERE name ILIKE $1
      ORDER BY popularity DESC NULLS LAST, name ASC
      LIMIT 50
    `,
    [`%${search}%`],
  );

  const selectedArtists = await queryRows<{
    id: string;
    name: string;
    popularity: number | null;
  }>(
    `
      SELECT id, name, popularity
      FROM artist
      WHERE id = $1
    `,
    [selectedArtistId],
  );

  const selectedAlbums = await queryRows<{
    id: string;
    inCart: boolean;
    title: string;
    year: number | null;
  }>(
    `
      SELECT
        album.id AS id,
        album.title AS title,
        album.year AS year,
        EXISTS (
          SELECT 1
          FROM cart_item
          WHERE cart_item.user_id = $2
            AND cart_item.album_id = album.id
        ) AS "inCart"
      FROM album
      WHERE album.artist_id = $1
      ORDER BY album.year DESC NULLS LAST, album.title ASC
    `,
    [selectedArtistId, userId],
  );

  const cartItems = await queryRows<{
    addedAt: number;
    albumArtistId: string;
    albumArtistName: string;
    albumId: string;
    albumTitle: string;
    albumYear: number | null;
    userId: string;
  }>(
    `
      SELECT
        cart_item.user_id AS "userId",
        cart_item.album_id AS "albumId",
        cart_item.added_at::bigint AS "addedAt",
        album.title AS "albumTitle",
        album.year AS "albumYear",
        artist.id AS "albumArtistId",
        artist.name AS "albumArtistName"
      FROM cart_item
      JOIN album ON album.id = cart_item.album_id
      JOIN artist ON artist.id = album.artist_id
      WHERE cart_item.user_id = $1
      ORDER BY cart_item.added_at DESC, album.title ASC
    `,
    [userId],
  );

  return {
    artists,
    cartItems: cartItems.map((row) => ({
      addedAt: row.addedAt,
      album: {
        artist: {
          id: row.albumArtistId,
          name: row.albumArtistName,
        },
        id: row.albumId,
        title: row.albumTitle,
        year: row.albumYear,
      },
      albumId: row.albumId,
      userId: row.userId,
    })),
    protocol: {
      target: options.target,
      userId,
    },
    search,
    selectedArtist:
      selectedArtists[0] === undefined
        ? null
        : {
            albums: selectedAlbums,
            id: selectedArtists[0].id,
            name: selectedArtists[0].name,
            popularity: selectedArtists[0].popularity,
          },
  };
}

export async function readMusicFixtureProtocolState(
  queryRows: QueryRows,
  options: {
    readonly clientGroupID?: string;
    readonly clientID?: string;
    readonly target: string;
    readonly userId?: string;
  },
): Promise<MusicFixtureProtocolState> {
  const userId = options.userId ?? MUSIC_FIXTURE_DEFAULTS.userId;
  const cartRows = await queryRows<{ albumId: string }>(
    `
      SELECT album_id AS "albumId"
      FROM cart_item
      WHERE user_id = $1
      ORDER BY added_at DESC, album_id ASC
    `,
    [userId],
  );

  if (!options.clientGroupID || !options.clientID) {
    return {
      cartAlbumIds: cartRows.map((row) => row.albumId),
      cartItemCount: cartRows.length,
      target: options.target,
      userId,
      zeroClient: null,
    };
  }

  const clientRows = await queryRows<{
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
      WHERE "clientGroupID" = $1
        AND "clientID" = $2
    `,
    [options.clientGroupID, options.clientID],
  );

  const mutationRows = await queryRows<{ mutationID: number }>(
    `
      SELECT "mutationID"::int AS "mutationID"
      FROM ${ZERO_CONTROL_SCHEMA}."mutations"
      WHERE "clientGroupID" = $1
        AND "clientID" = $2
      ORDER BY "mutationID" ASC
    `,
    [options.clientGroupID, options.clientID],
  );

  const client = clientRows[0];

  return {
    cartAlbumIds: cartRows.map((row) => row.albumId),
    cartItemCount: cartRows.length,
    target: options.target,
    userId,
    zeroClient: {
      clientGroupID: options.clientGroupID,
      clientID: options.clientID,
      exists: client !== undefined,
      lastMutationID: client?.lastMutationID ?? 0,
      mutationResultCount: mutationRows.length,
      mutationResultIDs: mutationRows.map((row) => row.mutationID),
    },
  };
}

export async function runDirectDrizzleCartAdd(
  db: Awaited<ReturnType<typeof createDirectDrizzleDatabase>>["db"],
  input: {
    readonly addedAt: number;
    readonly albumId: string;
    readonly userId: string;
  },
) {
  await db
    .insert(cartItem)
    .values({
      addedAt: input.addedAt,
      albumId: input.albumId,
      userId: input.userId,
    })
    .onConflictDoUpdate({
      target: [cartItem.userId, cartItem.albumId],
      set: {
        addedAt: input.addedAt,
      },
    });

  return { ok: true } as const;
}

export async function runDirectDrizzleRead(
  db: Awaited<ReturnType<typeof createDirectDrizzleDatabase>>["db"],
  request: DirectReadRequest,
  userId: string,
) {
  switch (request.name) {
    case "getArtist":
      return readDirectArtist(
        db,
        String(request.args?.artistId ?? MUSIC_FIXTURE_DEFAULTS.artistId),
        userId,
      );
    case "getCartItems":
      return readDirectCartItems(db, userId);
    case "listArtists":
      return readDirectArtistList(
        db,
        String(request.args?.search ?? ""),
        Number(request.args?.limit ?? 50),
      );
    default:
      throw new Error(`Unsupported direct read query: ${String(request.name)}`);
  }
}

async function readDirectArtist(
  db: Awaited<ReturnType<typeof createDirectDrizzleDatabase>>["db"],
  artistId: string,
  userId: string,
) {
  const artistRows = await db
    .select({
      id: artist.id,
      name: artist.name,
      popularity: artist.popularity,
    })
    .from(artist)
    .where(eq(artist.id, artistId))
    .limit(1);

  const albumRows = await db
    .select({
      id: album.id,
      inCart: cartItem.albumId,
      title: album.title,
      year: album.year,
    })
    .from(album)
    .leftJoin(cartItem, and(eq(cartItem.albumId, album.id), eq(cartItem.userId, userId)))
    .where(eq(album.artistId, artistId))
    .orderBy(desc(album.year), album.title);

  const selectedArtist = artistRows[0];

  if (!selectedArtist) {
    return null;
  }

  return {
    albums: albumRows.map((row) => ({
      id: row.id,
      inCart: row.inCart !== null,
      title: row.title,
      year: row.year,
    })),
    id: selectedArtist.id,
    name: selectedArtist.name,
    popularity: selectedArtist.popularity,
  };
}

async function readDirectCartItems(
  db: Awaited<ReturnType<typeof createDirectDrizzleDatabase>>["db"],
  userId: string,
) {
  const rows = await db
    .select({
      addedAt: cartItem.addedAt,
      albumArtistId: artist.id,
      albumArtistName: artist.name,
      albumId: album.id,
      albumTitle: album.title,
      albumYear: album.year,
      userId: cartItem.userId,
    })
    .from(cartItem)
    .innerJoin(album, eq(album.id, cartItem.albumId))
    .innerJoin(artist, eq(artist.id, album.artistId))
    .where(eq(cartItem.userId, userId))
    .orderBy(desc(cartItem.addedAt), album.title);

  return rows.map((row) => ({
    addedAt: row.addedAt,
    album: {
      artist: {
        id: row.albumArtistId,
        name: row.albumArtistName,
      },
      id: row.albumId,
      title: row.albumTitle,
      year: row.albumYear,
    },
    albumId: row.albumId,
    userId: row.userId,
  }));
}

async function readDirectArtistList(
  db: Awaited<ReturnType<typeof createDirectDrizzleDatabase>>["db"],
  search: string,
  limit: number,
) {
  return db
    .select({
      id: artist.id,
      name: artist.name,
      popularity: artist.popularity,
    })
    .from(artist)
    .where(ilike(artist.name, `%${search.trim()}%`))
    .orderBy(desc(artist.popularity), artist.name)
    .limit(limit);
}
