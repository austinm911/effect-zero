import {
  createDirectDrizzleDatabaseFromSql,
  readMusicFixtureDemoState,
  readMusicFixtureProtocolState,
  resetMusicFixtureState,
  runDirectDrizzleCartAdd,
  runDirectDrizzleRead,
  type MusicFixtureQueryName,
  type QueryRows,
} from "@effect-zero/example-data/server-fixture";
import { mustGetMutator, mustGetQuery, type ReadonlyJSONValue } from "@rocicorp/zero";
import { handleMutateRequest, handleQueryRequest } from "@rocicorp/zero/server";
import { zeroPostgresJS } from "@rocicorp/zero/server/adapters/postgresjs";
import { mutators } from "#app/zero/mutators.ts";
import { queries } from "#app/zero/queries.ts";
import { schema } from "#app/zero/schema.ts";
import { DEMO_USER_ID } from "#app/shared/constants.ts";
import { type SqlClient, withSqlClient } from "./pg.ts";

const getContext = () => ({ userId: DEMO_USER_ID });
const createQueryRows =
  (sql: SqlClient): QueryRows =>
  (statement, params = []) =>
    sql.unsafe(statement, [...params]);

function getMutationContext(args: ReadonlyJSONValue | undefined) {
  const benchmarkUserId =
    args && typeof args === "object"
      ? Array.isArray(args)
        ? args[0] &&
          typeof args[0] === "object" &&
          !Array.isArray(args[0]) &&
          "__benchmarkUserId" in args[0]
          ? args[0].__benchmarkUserId
          : undefined
        : "__benchmarkUserId" in args
          ? args.__benchmarkUserId
          : undefined
      : undefined;

  return {
    userId:
      typeof benchmarkUserId === "string" && benchmarkUserId.trim().length > 0
        ? benchmarkUserId
        : DEMO_USER_ID,
  };
}

export async function handlePromiseMutate(request: Request) {
  return withSqlClient(async (sql) => {
    const dbProvider = zeroPostgresJS(schema, sql);
    return handleMutateRequest(
      dbProvider,
      async (transact) =>
        transact(async (tx, name, args) => {
          const mutator = mustGetMutator(mutators, name);
          await mutator.fn({ tx, ctx: getMutationContext(args), args });
        }),
      request,
    );
  });
}

export async function handlePromiseQuery(request: Request) {
  return handleQueryRequest(
    (name, args) => {
      const query = mustGetQuery(queries, name);
      return query.fn({ args, ctx: getContext() });
    },
    schema,
    request,
  );
}

export async function handlePromiseDirectMutate(
  mutatorName: string,
  args: ReadonlyJSONValue | undefined,
) {
  return withSqlClient(async (sql) => {
    const dbProvider = zeroPostgresJS(schema, sql);
    const mutator = mustGetMutator(mutators, mutatorName);
    await dbProvider.transaction(async (tx) => {
      await mutator.fn({ tx, ctx: getMutationContext(args), args });
    });
  });
}

export async function handlePromiseZqlRead(body: {
  readonly args?: ReadonlyJSONValue;
  readonly name: string;
}) {
  return withSqlClient(async (sql) => {
    const zql = zeroPostgresJS(schema, sql);
    const query = mustGetQuery(queries, body.name);
    return zql.run(query.fn({ args: body.args, ctx: getContext() }) as never);
  });
}

export async function handlePromiseDemoReset(target: string) {
  return withSqlClient(async (sql) => {
    const queryRows = createQueryRows(sql);
    await resetMusicFixtureState(queryRows);
    return readMusicFixtureDemoState(queryRows, {
      target,
      userId: DEMO_USER_ID,
    });
  });
}

export async function handlePromiseDemoState(options: {
  readonly artistId?: string;
  readonly search?: string;
  readonly target: string;
}) {
  return withSqlClient(async (sql) =>
    readMusicFixtureDemoState(createQueryRows(sql), {
      artistId: options.artistId,
      search: options.search,
      target: options.target,
      userId: DEMO_USER_ID,
    }),
  );
}

export async function handlePromiseProtocolState(options: {
  readonly clientGroupID?: string;
  readonly clientID?: string;
  readonly target: string;
}) {
  return withSqlClient(async (sql) =>
    readMusicFixtureProtocolState(createQueryRows(sql), {
      clientGroupID: options.clientGroupID,
      clientID: options.clientID,
      target: options.target,
      userId: DEMO_USER_ID,
    }),
  );
}

export async function handlePromiseBenchmarkProtocolState(options: {
  readonly clientGroupID?: string;
  readonly clientID?: string;
  readonly target: string;
  readonly userId?: string;
}) {
  return withSqlClient(async (sql) =>
    readMusicFixtureProtocolState(createQueryRows(sql), {
      clientGroupID: options.clientGroupID,
      clientID: options.clientID,
      target: options.target,
      userId: options.userId ?? DEMO_USER_ID,
    }),
  );
}

export async function handlePromiseDirectDrizzleCartAdd(body: {
  readonly addedAt?: number;
  readonly albumId?: string;
}) {
  return withSqlClient(async (sql) =>
    runDirectDrizzleCartAdd(createDirectDrizzleDatabaseFromSql(sql), {
      addedAt: body.addedAt ?? Date.now(),
      albumId: body.albumId ?? "",
      userId: DEMO_USER_ID,
    }),
  );
}

export async function handlePromiseDirectRead(body: {
  readonly args?: Record<string, unknown>;
  readonly name: MusicFixtureQueryName;
}) {
  return withSqlClient(async (sql) =>
    runDirectDrizzleRead(
      createDirectDrizzleDatabaseFromSql(sql),
      {
        args: body.args,
        name: body.name,
      },
      DEMO_USER_ID,
    ),
  );
}
