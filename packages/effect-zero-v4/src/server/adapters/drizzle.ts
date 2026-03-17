import type { PgClient as EffectSqlPgClient } from "@effect/sql-pg/PgClient";
import * as PgClient from "@effect/sql-pg/PgClient";
import type { Schema as ZeroSchema } from "@rocicorp/zero";
import {
  type DBConnection,
  type DBTransaction,
  type Row,
  executePostgresQuery,
  ZQLDatabase,
} from "@rocicorp/zero/server";
import {
  makeWithDefaults,
  type EffectDrizzleConfig,
  type EffectPgDatabase,
} from "drizzle-orm/effect-postgres";
import {
  buildRelations,
  extractTablesFromSchema,
  type AnyRelations,
  type RelationsBuilderConfigValue,
} from "drizzle-orm/relations";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as ManagedRuntime from "effect/ManagedRuntime";
import * as Redacted from "effect/Redacted";
import type * as ServiceMap from "effect/ServiceMap";
import type { SqlClient as EffectSqlClient } from "effect/unstable/sql/SqlClient";
import type { SqlError } from "effect/unstable/sql/SqlError";
import type { EffectPgConfig, EffectZeroProvider } from "../types.js";

export type EffectV4Runtime = ManagedRuntime.ManagedRuntime<
  EffectSqlPgClient | EffectSqlClient,
  SqlError
>;

export type EffectV4DrizzleDatabase<
  TSchema extends Record<string, unknown> = Record<string, never>,
  TRelations extends AnyRelations = AnyRelations,
> = EffectPgDatabase<TSchema, TRelations>;

export type EffectV4DrizzleTransaction<
  TDrizzle extends { transaction: (...args: any[]) => unknown },
> = Parameters<Parameters<TDrizzle["transaction"]>[0]>[0];

export type DrizzleDatabase<
  TSchema extends Record<string, unknown> = Record<string, never>,
  TRelations extends AnyRelations = AnyRelations,
> = EffectV4DrizzleDatabase<TSchema, TRelations>;
export type DrizzleTransaction<
  TDrizzle extends { transaction: (...args: any[]) => unknown },
> = EffectV4DrizzleTransaction<TDrizzle>;

export interface CreateDbConnectionOptions<
  TSchema extends Record<string, unknown>,
  TRelations extends AnyRelations = AnyRelations,
> {
  readonly connectionString: string;
  readonly drizzleConfig?: Omit<EffectDrizzleConfig<TSchema, TRelations>, "schema">;
  readonly drizzleSchema: TSchema;
  readonly pgClientConfig?: EffectPgConfig;
}

export interface CreateZeroDbProviderOptions<
  TZeroSchema extends ZeroSchema,
  TSchema extends Record<string, unknown>,
  TRelations extends AnyRelations = AnyRelations,
> extends CreateDbConnectionOptions<TSchema, TRelations> {
  readonly zeroSchema: TZeroSchema;
}

export interface CreateZeroDbProviderFromDbOptions<
  TZeroSchema extends ZeroSchema,
  TDrizzle extends EffectV4DrizzleDatabase<any, any>,
> {
  readonly db: TDrizzle;
  readonly zeroSchema: TZeroSchema;
}

export interface EffectV4DbProvider<
  TZeroSchema extends ZeroSchema,
  TDrizzle extends EffectV4DrizzleDatabase<any, any>,
> extends EffectZeroProvider<TZeroSchema, EffectV4DrizzleTransaction<TDrizzle>> {
  readonly connection: EffectV4DbConnection<TDrizzle>;
}

export interface EffectV4ZeroDbProvider<
  TZeroSchema extends ZeroSchema,
  TDrizzle extends EffectV4DrizzleDatabase<any, any>,
> extends EffectV4DbProvider<TZeroSchema, TDrizzle> {}

interface QueryCapableTransaction {
  readonly _?: {
    readonly session?: QuerySession;
  };
  readonly session?: QuerySession;
}

interface QuerySession {
  prepareQuery(
    query: { readonly params: unknown[]; readonly sql: string },
    fields: undefined,
    name: undefined,
    isResponseInArrayMode: boolean,
  ): {
    execute(): Effect.Effect<unknown, unknown, never>;
  };
}

interface QueryCapableDatabase {
  readonly _: {
    readonly session?: QuerySession;
  };
  readonly session?: QuerySession;
}

type EffectRunner = <A, E>(effect: Effect.Effect<A, E, never>) => Promise<A>;

export class EffectV4DbConnection<
  TDrizzle extends EffectV4DrizzleDatabase<any, any>,
> implements DBConnection<EffectV4DrizzleTransaction<TDrizzle>> {
  readonly drizzle: TDrizzle;
  readonly #disposeConnection: () => Promise<void>;
  readonly #runEffect: EffectRunner;

  constructor(options: {
    readonly dispose?: () => Promise<void>;
    readonly drizzle: TDrizzle;
    readonly runEffect: EffectRunner;
  }) {
    this.drizzle = options.drizzle;
    this.#disposeConnection = options.dispose ?? (async () => {});
    this.#runEffect = options.runEffect;
  }

  readonly transaction: DBConnection<EffectV4DrizzleTransaction<TDrizzle>>["transaction"] = (
    callback,
  ) => {
    const fallbackSession = resolveQuerySession(this.drizzle as QueryCapableDatabase);

    return this.#runEffect(
      this.drizzle.transaction(
        (wrappedTransaction) =>
          Effect.gen(function* () {
            const services = yield* Effect.services<never>();

            return yield* liftPromise(() =>
              callback(
                new EffectV4DbTransaction(
                  wrappedTransaction as QueryCapableTransaction,
                  (effect) => runEffectWithServices(services, effect),
                  fallbackSession,
                ) as unknown as DBTransaction<EffectV4DrizzleTransaction<TDrizzle>>,
              ),
            );
          }) as Effect.Effect<Awaited<ReturnType<typeof callback>>, never, never>,
      ),
    );
  };

  async dispose() {
    await this.#disposeConnection();
  }
}

class EffectV4DbTransaction<
  TWrappedTransaction extends QueryCapableTransaction,
> implements DBTransaction<TWrappedTransaction> {
  readonly wrappedTransaction: TWrappedTransaction;
  readonly #fallbackSession: QuerySession;
  readonly #runEffect: EffectRunner;

  constructor(
    wrappedTransaction: TWrappedTransaction,
    runEffect: EffectRunner,
    fallbackSession: QuerySession,
  ) {
    this.wrappedTransaction = wrappedTransaction;
    this.#runEffect = runEffect;
    this.#fallbackSession = fallbackSession;
  }

  readonly query: DBTransaction<TWrappedTransaction>["query"] = async (sql, params) => {
    const prepared = resolveQuerySession(
      this.wrappedTransaction,
      this.#fallbackSession,
    ).prepareQuery({ params, sql }, undefined, undefined, false);
    const result = await this.#runEffect(prepared.execute());
    return toIterableRows(result);
  };

  readonly runQuery: DBTransaction<TWrappedTransaction>["runQuery"] = (
    ast,
    format,
    schema,
    serverSchema,
  ) => {
    return executePostgresQuery(this, ast, format, schema, serverSchema);
  };
}

class InlineEffectV4DbConnection<
  TDrizzle extends EffectV4DrizzleDatabase<any, any>,
> extends EffectV4DbConnection<TDrizzle> {
  constructor(drizzleDatabase: TDrizzle) {
    super({
      drizzle: drizzleDatabase,
      runEffect: runEffectWithoutRuntime,
    });
  }
}

export async function createDbConnection<
  TSchema extends Record<string, unknown>,
  TRelations extends AnyRelations = AnyRelations,
>(options: CreateDbConnectionOptions<TSchema, TRelations>) {
  const runtime = ManagedRuntime.make(
    PgClient.layer({
      ...options.pgClientConfig,
      url: Redacted.make(options.connectionString),
    }),
  );

  try {
    const relations = buildDrizzleRelations(options.drizzleSchema);
    const drizzleDatabase = await runtime.runPromise(
      makeWithDefaults<TSchema, TRelations>({
        ...options.drizzleConfig,
        ...(relations ? { relations: relations as unknown as TRelations } : {}),
        schema: options.drizzleSchema,
      }),
    );

    return new EffectV4DbConnection({
      dispose: () => runtime.dispose(),
      drizzle: drizzleDatabase,
      runEffect: (effect) => runEffectWithManagedRuntime(runtime, effect),
    });
  } catch (error) {
    await runtime.dispose();
    throw error;
  }
}

export async function createZeroDbProvider<
  TZeroSchema extends ZeroSchema,
  TSchema extends Record<string, unknown>,
  TRelations extends AnyRelations = AnyRelations,
>(
  options: CreateZeroDbProviderOptions<TZeroSchema, TSchema, TRelations>,
): Promise<EffectV4ZeroDbProvider<TZeroSchema, EffectV4DrizzleDatabase<TSchema, TRelations>>>;
export async function createZeroDbProvider<
  TZeroSchema extends ZeroSchema,
  TDrizzle extends EffectV4DrizzleDatabase<any, any>,
>(
  options: CreateZeroDbProviderFromDbOptions<TZeroSchema, TDrizzle>,
): Promise<EffectV4ZeroDbProvider<TZeroSchema, TDrizzle>>;
export async function createZeroDbProvider<
  TZeroSchema extends ZeroSchema,
  TSchema extends Record<string, unknown>,
  TRelations extends AnyRelations = AnyRelations,
  TDrizzle extends EffectV4DrizzleDatabase<any, any> = EffectV4DrizzleDatabase<any, any>,
>(
  options:
    | CreateZeroDbProviderOptions<TZeroSchema, TSchema, TRelations>
    | CreateZeroDbProviderFromDbOptions<TZeroSchema, TDrizzle>,
) {
  if ("db" in options) {
    const connection = new InlineEffectV4DbConnection(options.db);

    return {
      connection,
      dispose: async () => {},
      zql: zeroDrizzleEffectV4(options.zeroSchema, connection),
    } satisfies EffectV4ZeroDbProvider<TZeroSchema, TDrizzle>;
  }

  const connection = await createDbConnection({
    connectionString: options.connectionString,
    drizzleConfig: options.drizzleConfig,
    drizzleSchema: options.drizzleSchema,
    pgClientConfig: options.pgClientConfig,
  });

  return {
    connection,
    dispose: () => connection.dispose(),
    zql: zeroDrizzleEffectV4(options.zeroSchema, connection),
  } satisfies EffectV4ZeroDbProvider<TZeroSchema, typeof connection.drizzle>;
}

export function zeroEffectDrizzle<
  TZeroSchema extends ZeroSchema,
  TDrizzle extends EffectV4DrizzleDatabase<any, any>,
>(schema: TZeroSchema, db: TDrizzle): EffectZeroProvider<TZeroSchema, EffectV4DrizzleTransaction<TDrizzle>> {
  return {
    dispose: async () => {},
    zql: new ZQLDatabase(
      new InlineEffectV4DbConnection(db),
      schema,
    ),
  };
}

export function zeroDrizzleEffectV4<
  TZeroSchema extends ZeroSchema,
  TDrizzle extends EffectV4DrizzleDatabase<any, any>,
>(schema: TZeroSchema, connection: EffectV4DbConnection<TDrizzle>) {
  return new ZQLDatabase(connection, schema);
}

function isIterable(value: unknown): value is Iterable<unknown> {
  return value != null && typeof (value as Iterable<unknown>)[Symbol.iterator] === "function";
}

export function toIterableRows(result: unknown): Iterable<Row> {
  if (result === null || result === undefined) {
    return [];
  }

  if (Array.isArray(result)) {
    return result as Row[];
  }

  if (isIterable(result)) {
    return result as Iterable<Row>;
  }

  if (typeof result === "object") {
    const rows = (result as { rows?: unknown }).rows;

    if (rows === null || rows === undefined) {
      return [];
    }

    if (Array.isArray(rows)) {
      return rows as Row[];
    }

    if (isIterable(rows)) {
      return rows as Iterable<Row>;
    }
  }

  throw new TypeError("Drizzle query result is not iterable");
}

function buildDrizzleRelations<TSchema extends Record<string, unknown>>(schema: TSchema) {
  const relationEntries = Object.entries(schema).filter(([key]) => key.endsWith("Relations"));

  if (relationEntries.length === 0) {
    return undefined;
  }

  const relationConfig = Object.fromEntries(
    relationEntries.map(([key, value]) => [
      key.slice(0, Math.max(0, key.length - "Relations".length)),
      value,
    ]),
  ) as Record<string, RelationsBuilderConfigValue>;

  return buildRelations(extractTablesFromSchema(schema), relationConfig);
}

function resolveQuerySession(
  target: QueryCapableTransaction | QueryCapableDatabase,
  fallback?: QuerySession,
) {
  const session = target._?.session ?? target.session ?? fallback;

  if (session) {
    return session;
  }

  throw new TypeError("Effect v4 Drizzle transaction does not expose a query session");
}

function liftPromise<T>(operation: () => Promise<T>) {
  return Effect.tryPromise({
    catch: identityEffectFailure,
    try: operation,
  });
}

function identityEffectFailure(error: unknown): unknown {
  return error;
}

async function runEffectWithManagedRuntime<A, E>(
  runtime: EffectV4Runtime,
  effect: Effect.Effect<A, E, never>,
) {
  const exit = await runtime.runPromiseExit(effect);

  if (Exit.isSuccess(exit)) {
    return exit.value;
  }

  throw Cause.squash(exit.cause);
}

async function runEffectWithoutRuntime<A, E>(effect: Effect.Effect<A, E, never>) {
  const exit = await Effect.runPromiseExit(effect);

  if (Exit.isSuccess(exit)) {
    return exit.value;
  }

  throw Cause.squash(exit.cause);
}

async function runEffectWithServices<A, E>(
  services: ServiceMap.ServiceMap<never>,
  effect: Effect.Effect<A, E, never>,
) {
  const exit = await Effect.runPromiseExitWith(services)(effect);

  if (Exit.isSuccess(exit)) {
    return exit.value;
  }

  throw Cause.squash(exit.cause);
}
