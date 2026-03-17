import type { PgClient as EffectSqlPgClient } from "@effect-zero/sql-pg-v4/PgClient";
import * as PgClient from "@effect-zero/sql-pg-v4/PgClient";
import type { Schema as ZeroSchema } from "@rocicorp/zero";
import {
  type DBConnection,
  type DBTransaction,
  type Row,
  executePostgresQuery,
  ZQLDatabase,
} from "@rocicorp/zero/server";
import type {
  EffectDrizzleConfig,
  EffectPgDatabase,
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
import { createRequire } from "node:module";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

type EffectPostgresModule = typeof import("drizzle-orm/effect-postgres");

let loadedEffectPostgresModule: Promise<EffectPostgresModule> | undefined;

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
  const { makeWithDefaults } = await loadPatchedEffectPostgresModule();

  const runtime = ManagedRuntime.make(
    PgClient.layer({
      ...options.pgClientConfig,
      url: Redacted.make(options.connectionString),
    }),
  ) as EffectV4Runtime;

  try {
    const relations = buildDrizzleRelations(options.drizzleSchema);
    const drizzleDatabase = await runtime.runPromise(
      makeWithDefaults<TSchema, TRelations>({
        ...options.drizzleConfig,
        ...(relations ? { relations: relations as unknown as TRelations } : {}),
        schema: options.drizzleSchema,
      }) as unknown as Effect.Effect<EffectV4DrizzleDatabase<TSchema, TRelations>, never, never>,
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

async function loadPatchedEffectPostgresModule() {
  loadedEffectPostgresModule ??= importPatchedEffectPostgresModule();
  return loadedEffectPostgresModule;
}

async function importPatchedEffectPostgresModule() {
  const runtimePaths = resolveDrizzleV4RuntimePaths();

  patchDrizzleV4Runtime(runtimePaths);

  try {
    return await import("drizzle-orm/effect-postgres");
  } catch (error) {
    throw new Error(
      [
        "@effect-zero/v4 drizzle support could not load the patched Drizzle Effect v4 runtime.",
        "This adapter mirrors the compatibility changes from drizzle-orm PR #5484 at runtime.",
        `driverPath=${runtimePaths.drizzleDriverPath}`,
        `effectPackageRoot=${runtimePaths.effectPackageRoot}`,
        `sqlPgAliasPath=${runtimePaths.sqlPgAliasPath}`,
        `cause=${error instanceof Error ? error.message : String(error)}`,
      ].join(" "),
      { cause: error },
    );
  }
}

function resolveDrizzleV4RuntimePaths() {
  const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const requireFromPackage = createRequire(path.join(packageRoot, "package.json"));
  const drizzleDriverPath = requireFromPackage.resolve("drizzle-orm/effect-postgres/driver");
  const effectPath = requireFromPackage.resolve("effect/Effect");
  const sqlPgAliasPath = requireFromPackage.resolve("@effect-zero/sql-pg-v4/PgClient");
  const drizzlePackageRoot = path.resolve(path.dirname(drizzleDriverPath), "..");
  const drizzleNodeModules = path.resolve(path.dirname(drizzleDriverPath), "..", "..");
  const effectPackageRoot = path.resolve(path.dirname(effectPath), "..");

  return {
    drizzleDriverPath,
    drizzleNodeModules,
    drizzlePackageRoot,
    effectPackageRoot,
    effectLinkPath: path.join(drizzleNodeModules, "effect"),
    effectLinkTarget: path.relative(drizzleNodeModules, effectPackageRoot),
    effectableModulePath: path.join(effectPackageRoot, "dist/Effectable.js"),
    drizzleDriverModulePath: path.join(drizzlePackageRoot, "effect-postgres/driver.js"),
    drizzleSessionModulePath: path.join(drizzlePackageRoot, "effect-postgres/session.js"),
    drizzlePgSessionModulePath: path.join(drizzlePackageRoot, "pg-core/effect/session.js"),
    drizzleEffectErrorsModulePath: path.join(drizzlePackageRoot, "effect-core/errors.js"),
    drizzleEffectLoggerModulePath: path.join(drizzlePackageRoot, "effect-core/logger.js"),
    drizzleEffectQueryEffectModulePath: path.join(drizzlePackageRoot, "effect-core/query-effect.js"),
    drizzleEffectCacheModulePath: path.join(drizzlePackageRoot, "cache/core/cache-effect.js"),
    sqlPgAliasPath,
  };
}

function patchDrizzleV4Runtime(paths: ReturnType<typeof resolveDrizzleV4RuntimePaths>) {
  ensureDirectory(path.dirname(paths.effectLinkPath));
  replaceLink(paths.effectLinkPath, paths.effectLinkTarget);
  ensureEffectableShim(paths.effectableModulePath);
  ensureSqlPgAliasImport(paths.drizzleDriverModulePath);
  ensurePatchedDrizzleEffectErrors(paths.drizzleEffectErrorsModulePath);
  ensurePatchedDrizzleEffectLogger(paths.drizzleEffectLoggerModulePath);
  ensurePatchedDrizzleEffectQuery(paths.drizzleEffectQueryEffectModulePath);
  ensurePatchedDrizzleEffectCache(paths.drizzleEffectCacheModulePath);
  ensurePatchedDrizzlePgCoreSession(paths.drizzlePgSessionModulePath);
  ensurePatchedDrizzleSession(paths.drizzleSessionModulePath);
}

function ensureDirectory(directoryPath: string) {
  mkdirSync(directoryPath, { recursive: true });
}

function replaceLink(linkPath: string, targetPath: string) {
  const resolvedTargetPath = path.resolve(path.dirname(linkPath), targetPath);

  if (resolvedTargetPath === linkPath) {
    return;
  }

  try {
    if (existsSync(linkPath) && realpathSync(linkPath) === resolvedTargetPath) {
      return;
    }
  } catch {}

  try {
    const existing = lstatSync(linkPath);

    if (existing.isSymbolicLink() || existing.isDirectory() || existing.isFile()) {
      rmSync(linkPath, { force: true, recursive: true });
    }
  } catch {}

  symlinkSync(targetPath, linkPath, "dir");
}

function ensureEffectableShim(modulePath: string) {
  if (existsSync(modulePath)) {
    return;
  }

  writeFileSync(
    modulePath,
    [
      'import { EffectTypeId, PipeInspectableProto, YieldableProto, evaluate } from "./internal/core.js";',
      "",
      "const effectVariance = {",
      "  _A: (value) => value,",
      "  _E: (value) => value,",
      "  _R: (value) => value,",
      "};",
      "",
      "export const CommitPrototype = {",
      "  [EffectTypeId]: effectVariance,",
      "  ...PipeInspectableProto,",
      "  ...YieldableProto,",
      "  asEffect() {",
      "    return this.commit();",
      "  },",
      "  [evaluate](fiber) {",
      "    return this.commit().asEffect()[evaluate](fiber);",
      "  },",
      "};",
      "",
    ].join("\n"),
    "utf8",
  );
}

function ensureSqlPgAliasImport(modulePath: string) {
  const currentSource = readFileSync(modulePath, "utf8");
  const nextSource = currentSource.replaceAll(
    "@effect/sql-pg/PgClient",
    "@effect-zero/sql-pg-v4/PgClient",
  );

  if (nextSource !== currentSource) {
    writeFileSync(modulePath, nextSource, "utf8");
  }
}

function ensurePatchedDrizzleEffectErrors(modulePath: string) {
  if (fileContains(modulePath, "FIX_DRIZZLE_V4_BETA")) {
    return;
  }

  writeFileSync(
    modulePath,
    [
      'import { entityKind } from "../entity.js";',
      "",
      "// FIX_DRIZZLE_V4_BETA",
      "var EffectDrizzleError = class extends Error {",
      '  static [entityKind] = "EffectDrizzleError";',
      "  constructor({ message, cause }) {",
      "    super(message);",
      '    this.name = "EffectDrizzleError";',
      "    this.cause = cause;",
      "    Error.captureStackTrace?.(this, EffectDrizzleError);",
      "  }",
      "};",
      "var EffectDrizzleQueryError = class extends Error {",
      '  static [entityKind] = "EffectDrizzleQueryError";',
      "  constructor({ query, params, cause }) {",
      "    super(`Failed query: ${query}\\nparams: ${params}`);",
      '    this.name = "EffectDrizzleQueryError";',
      "    this.query = query;",
      "    this.params = params;",
      "    this.cause = cause;",
      "    Error.captureStackTrace?.(this, EffectDrizzleQueryError);",
      "  }",
      "};",
      "var EffectTransactionRollbackError = class extends Error {",
      '  static [entityKind] = "EffectTransactionRollbackError";',
      "  constructor() {",
      '    super("Rollback");',
      '    this.name = "EffectTransactionRollbackError";',
      "    Error.captureStackTrace?.(this, EffectTransactionRollbackError);",
      "  }",
      "};",
      "var MigratorInitError = class extends Error {",
      '  static [entityKind] = "MigratorInitError";',
      "  constructor({ exitCode }) {",
      "    super(`Migrator init failed: ${exitCode}`);",
      '    this.name = "MigratorInitError";',
      "    this.exitCode = exitCode;",
      "    Error.captureStackTrace?.(this, MigratorInitError);",
      "  }",
      "};",
      "",
      "export { EffectDrizzleError, EffectDrizzleQueryError, EffectTransactionRollbackError, MigratorInitError };",
      "",
    ].join("\n"),
    "utf8",
  );
}

function ensurePatchedDrizzleEffectLogger(modulePath: string) {
  if (fileContains(modulePath, "FIX_DRIZZLE_V4_BETA")) {
    return;
  }

  writeFileSync(
    modulePath,
    [
      'import { entityKind } from "../entity.js";',
      'import * as Effect from "effect/Effect";',
      'import * as Layer from "effect/Layer";',
      'import * as ServiceMap from "effect/ServiceMap";',
      "",
      "// FIX_DRIZZLE_V4_BETA",
      'class EffectLogger extends ServiceMap.Service()("drizzle-orm/EffectLogger") {',
      '  static [entityKind] = "drizzle-orm/EffectLogger";',
      "  static logQuery(query, params) {",
      "    return this.use((logger) => logger.logQuery(query, params));",
      "  }",
      "  static fromDrizzle(logger) {",
      "    return {",
      "      logQuery: (query, params) => Effect.sync(() => logger.logQuery(query, params)),",
      "    };",
      "  }",
      "  static layerFromDrizzle(logger) {",
      "    return Layer.succeed(this)(this.fromDrizzle(logger));",
      "  }",
      "}",
      "EffectLogger.Default = Layer.succeed(EffectLogger)({",
      "  logQuery: (_query, _params) => Effect.void,",
      "});",
      "EffectLogger.layer = Layer.succeed(EffectLogger)({",
      "  logQuery: Effect.fn(\"EffectLogger.logQuery\")(function* (query, params) {",
      "    const stringifiedParams = params.map((param) => {",
      "      try {",
      "        return JSON.stringify(param);",
      "      } catch {",
      "        return String(param);",
      "      }",
      "    });",
      "    yield* Effect.log().pipe(Effect.annotateLogs({ query, params: stringifiedParams }));",
      "  }),",
      "});",
      "",
      "export { EffectLogger };",
      "",
    ].join("\n"),
    "utf8",
  );
}

function ensurePatchedDrizzleEffectQuery(modulePath: string) {
  if (fileContains(modulePath, "FIX_DRIZZLE_V4_BETA")) {
    return;
  }

  writeFileSync(
    modulePath,
    [
      'import * as Effectable from "effect/Effectable";',
      "",
      "// FIX_DRIZZLE_V4_BETA",
      "function applyEffectWrapper(baseClass) {",
      "  Object.assign(baseClass.prototype, Effectable.CommitPrototype);",
      "  baseClass.prototype.commit = function() {",
      "    return this.execute();",
      "  };",
      "}",
      "",
      "export { applyEffectWrapper };",
      "",
    ].join("\n"),
    "utf8",
  );
}

function ensurePatchedDrizzleEffectCache(modulePath: string) {
  if (fileContains(modulePath, "FIX_DRIZZLE_V4_BETA")) {
    return;
  }

  writeFileSync(
    modulePath,
    [
      'import { NoopCache } from "./cache.js";',
      'import { entityKind } from "../../entity.js";',
      'import * as Effect from "effect/Effect";',
      'import * as Layer from "effect/Layer";',
      'import * as ServiceMap from "effect/ServiceMap";',
      "",
      "// FIX_DRIZZLE_V4_BETA",
      'class EffectCache extends ServiceMap.Service()("drizzle-orm/EffectCache") {',
      '  static [entityKind] = "drizzle-orm/EffectCache";',
      "  static strategy() {",
      "    return this.useSync((cache) => cache.strategy());",
      "  }",
      "  static get(...args) {",
      "    return this.use((cache) => cache.get(...args));",
      "  }",
      "  static put(...args) {",
      "    return this.use((cache) => cache.put(...args));",
      "  }",
      "  static onMutate(params) {",
      "    return this.use((cache) => cache.onMutate(params));",
      "  }",
      "  static fromDrizzle(cache) {",
      "    return make(cache);",
      "  }",
      "  static layerFromDrizzle(cache) {",
      "    return Layer.succeed(this)(make(cache));",
      "  }",
      "}",
      "EffectCache.Default = Layer.succeed(EffectCache)(make(new NoopCache()));",
      "",
      "function make(cache) {",
      "  const strategy = () => cache.strategy();",
      "  const get = (...args) => Effect.tryPromise({",
      "    try: () => cache.get(...args),",
      "    catch: (cause) => new EffectCacheError({ cause }),",
      "  });",
      "  const put = (...args) => Effect.tryPromise({",
      "    try: () => cache.put(...args),",
      "    catch: (cause) => new EffectCacheError({ cause }),",
      "  });",
      "  const onMutate = (params) => Effect.tryPromise({",
      "    try: () => cache.onMutate(params),",
      "    catch: (cause) => new EffectCacheError({ cause }),",
      "  });",
      "  return { strategy, get, put, onMutate, cache };",
      "}",
      "class EffectCacheError extends Error {",
      '  static [entityKind] = "EffectCacheError";',
      "  constructor({ cause }) {",
      '    super("Effect cache operation failed");',
      '    this.name = "EffectCacheError";',
      "    this.cause = cause;",
      "    Error.captureStackTrace?.(this, EffectCacheError);",
      "  }",
      "}",
      "",
      "export { EffectCache, EffectCacheError };",
      "",
    ].join("\n"),
    "utf8",
  );
}

function ensurePatchedDrizzleSession(modulePath: string) {
  if (fileContains(modulePath, "FIX_DRIZZLE_V4_BETA")) {
    return;
  }

  writeFileSync(
    modulePath,
    [
      'import { entityKind } from "../entity.js";',
      'import { mapResultRow } from "../utils.js";',
      'import { fillPlaceholders } from "../sql/sql.js";',
      'import * as Effect from "effect/Effect";',
      'import { EffectDrizzleQueryError } from "../effect-core/errors.js";',
      'import { PgEffectPreparedQuery, PgEffectSession, PgEffectTransaction } from "../pg-core/effect/session.js";',
      'import { EffectLogger } from "../effect-core/logger.js";',
      "",
      "// FIX_DRIZZLE_V4_BETA",
      "var EffectPgPreparedQuery = class extends PgEffectPreparedQuery {",
      '  static [entityKind] = "EffectPgPreparedQuery";',
      "  constructor(client, queryString, params, logger, cache, queryMetadata, cacheConfig, fields, name, _isResponseInArrayMode, customResultMapper, isRqbV2Query) {",
      "    super({ sql: queryString, params }, cache, queryMetadata, cacheConfig);",
      "    this.client = client;",
      "    this.queryString = queryString;",
      "    this.params = params;",
      "    this.logger = logger;",
      "    this.fields = fields;",
      "    this._isResponseInArrayMode = _isResponseInArrayMode;",
      "    this.customResultMapper = customResultMapper;",
      "    this.isRqbV2Query = isRqbV2Query;",
      "  }",
      "  execute(placeholderValues) {",
      "    const self = this;",
      "    return Effect.gen(function* () {",
      "      if (self.isRqbV2Query) return yield* self.executeRqbV2(placeholderValues);",
      "      const { query, customResultMapper, fields, joinsNotNullableMap, client } = self;",
      "      const params = fillPlaceholders(query.params, placeholderValues ?? {});",
      "      yield* EffectLogger.logQuery(query.sql, params);",
      "      if (!fields && !customResultMapper) {",
      "        return yield* self.queryWithCache(query.sql, params, self.client.unsafe(query.sql, params).withoutTransform);",
      "      }",
      "      return yield* self.queryWithCache(query.sql, params, client.unsafe(query.sql, params).values).pipe(",
      "        Effect.map((rows) => {",
      "          if (customResultMapper) return customResultMapper(rows);",
      "          return rows.map((row) => mapResultRow(fields, row, joinsNotNullableMap));",
      "        }),",
      "      );",
      "    }).pipe(Effect.provideService(EffectLogger, self.logger));",
      "  }",
      "  executeRqbV2(placeholderValues) {",
      "    const self = this;",
      "    return Effect.gen(function* () {",
      "      const { query, customResultMapper, client } = self;",
      "      const params = fillPlaceholders(query.params, placeholderValues ?? {});",
      "      yield* EffectLogger.logQuery(query.sql, params);",
      "      return yield* client.unsafe(query.sql, params).withoutTransform.pipe(",
      "        Effect.flatMap((value) => Effect.try({ try: () => customResultMapper(value), catch: (cause) => cause })),",
      "        Effect.catch((cause) => new EffectDrizzleQueryError({ query: query.sql, params, cause })),",
      "      );",
      "    }).pipe(Effect.provideService(EffectLogger, self.logger));",
      "  }",
      "  all(placeholderValues) {",
      "    const self = this;",
      "    return Effect.gen(function* () {",
      "      const { query, client } = self;",
      "      const params = fillPlaceholders(query.params, placeholderValues ?? {});",
      "      yield* EffectLogger.logQuery(query.sql, params);",
      "      return yield* self.queryWithCache(query.sql, params, client.unsafe(query.sql, params).withoutTransform);",
      "    }).pipe(Effect.provideService(EffectLogger, self.logger));",
      "  }",
      "  isResponseInArrayMode() {",
      "    return this._isResponseInArrayMode;",
      "  }",
      "};",
      "var EffectPgSession = class extends PgEffectSession {",
      '  static [entityKind] = "EffectPgSession";',
      "  constructor(client, dialect, relations, schema, logger, cache) {",
      "    super(dialect);",
      "    this.client = client;",
      "    this.relations = relations;",
      "    this.schema = schema;",
      "    this.logger = logger;",
      "    this.cache = cache;",
      "  }",
      "  prepareQuery(query, fields, name, isResponseInArrayMode, customResultMapper, queryMetadata, cacheConfig) {",
      "    return new EffectPgPreparedQuery(this.client, query.sql, query.params, this.logger, this.cache, queryMetadata, cacheConfig, fields, name, isResponseInArrayMode, customResultMapper, false);",
      "  }",
      "  prepareRelationalQuery(query, fields, name, customResultMapper) {",
      "    return new EffectPgPreparedQuery(this.client, query.sql, query.params, this.logger, this.cache, void 0, void 0, fields, name, false, customResultMapper, true);",
      "  }",
      "  execute(query) {",
      "    return this.prepareQuery(this.dialect.sqlToQuery(query), void 0, void 0, false).execute();",
      "  }",
      "  all(query) {",
      "    return this.prepareQuery(this.dialect.sqlToQuery(query), void 0, void 0, false).all();",
      "  }",
      "  transaction(transaction) {",
      "    const { dialect, relations, schema } = this;",
      "    return this.client.withTransaction(Effect.gen(function* () {",
      "      return yield* transaction(new EffectPgTransaction(dialect, this, relations, schema));",
      "    }.bind(this)));",
      "  }",
      "};",
      "var EffectPgTransaction = class extends PgEffectTransaction {",
      '  static [entityKind] = "EffectPgTransaction";',
      "};",
      "",
      "export { EffectPgPreparedQuery, EffectPgSession, EffectPgTransaction };",
      "",
    ].join("\n"),
    "utf8",
  );
}

function ensurePatchedDrizzlePgCoreSession(modulePath: string) {
  if (fileContains(modulePath, "FIX_DRIZZLE_V4_BETA")) {
    return;
  }

  writeFileSync(
    modulePath,
    [
      'import { PgBasePreparedQuery, PgSession } from "../session.js";',
      'import { PgEffectDatabase } from "./db.js";',
      'import { entityKind, is } from "../../entity.js";',
      'import { assertUnreachable } from "../../utils.js";',
      'import { sql } from "../../sql/sql.js";',
      'import { getMigrationsToRun } from "../../migrator.utils.js";',
      'import { NoopCache, strategyFor } from "../../cache/core/cache.js";',
      'import * as Effect from "effect/Effect";',
      'import * as Cause from "effect/Cause";',
      'import { EffectCache } from "../../cache/core/cache-effect.js";',
      'import { EffectDrizzleQueryError, EffectTransactionRollbackError, MigratorInitError } from "../../effect-core/errors.js";',
      'import { upgradeIfNeeded } from "../../up-migrations/effect-pg.js";',
      "",
      "// FIX_DRIZZLE_V4_BETA",
      "var PgEffectPreparedQuery = class extends PgBasePreparedQuery {",
      '  static [entityKind] = "PgEffectPreparedQuery";',
      "  constructor(query, cache, queryMetadata, cacheConfig) {",
      "    super(query);",
      "    this.cache = cache;",
      "    this.queryMetadata = queryMetadata;",
      "    this.cacheConfig = cacheConfig;",
      "    if (cache && cache.strategy() === \"all\" && cacheConfig === void 0) this.cacheConfig = { enabled: true, autoInvalidate: true };",
      "    if (!this.cacheConfig?.enabled) this.cacheConfig = void 0;",
      "  }",
      "  queryWithCache(queryString, params, query) {",
      "    const self = this;",
      "    return Effect.gen(function* () {",
      "      const { cacheConfig, queryMetadata } = self;",
      "      const cache = yield* EffectCache;",
      "      const cacheStrat = cache && !is(cache.cache, NoopCache)",
      "        ? yield* Effect.tryPromise({ try: () => strategyFor(queryString, params, queryMetadata, cacheConfig), catch: (cause) => cause })",
      "        : { type: \"skip\" };",
      "      if (cacheStrat.type === \"skip\") return yield* query;",
      "      if (cacheStrat.type === \"invalidate\") {",
      "        const result = yield* query;",
      "        yield* cache.onMutate({ tables: cacheStrat.tables });",
      "        return result;",
      "      }",
      "      if (cacheStrat.type === \"try\") {",
      "        const { tables, key, isTag, autoInvalidate, config } = cacheStrat;",
      "        const fromCache = yield* cache.get(key, tables, isTag, autoInvalidate);",
      "        if (typeof fromCache !== \"undefined\") return fromCache;",
      "        const result = yield* query;",
      "        yield* cache.put(key, result, autoInvalidate ? tables : [], isTag, config);",
      "        return result;",
      "      }",
      "      assertUnreachable(cacheStrat);",
      "    }).pipe(",
      "      Effect.provideService(EffectCache, self.cache),",
      "      Effect.catch((cause) => new EffectDrizzleQueryError({ query: queryString, params, cause: Cause.fail(cause) })),",
      "    );",
      "  }",
      "};",
      "var PgEffectSession = class extends PgSession {",
      '  static [entityKind] = "PgEffectSession";',
      "  constructor(dialect) {",
      "    super(dialect);",
      "  }",
      "  execute(query) {",
      "    const { sql: sqlQuery, params } = this.dialect.sqlToQuery(query);",
      "    return this.prepareQuery({ sql: sqlQuery, params }, void 0, void 0, false).execute();",
      "  }",
      "  all(query) {",
      "    const { sql: sqlQuery, params } = this.dialect.sqlToQuery(query);",
      "    return this.prepareQuery({ sql: sqlQuery, params }, void 0, void 0, false).all();",
      "  }",
      "};",
      "var PgEffectTransaction = class extends PgEffectDatabase {",
      '  static [entityKind] = "PgEffectTransaction";',
      "  constructor(dialect, session, relations, schema, nestedIndex = 0, parseRqbJson) {",
      "    super(dialect, session, relations, schema, parseRqbJson);",
      "    this.relations = relations;",
      "    this.schema = schema;",
      "    this.nestedIndex = nestedIndex;",
      "  }",
      "  rollback() {",
      "    return new EffectTransactionRollbackError({});",
      "  }",
      "  getTransactionConfigSQL(config) {",
      "    const chunks = [];",
      "    if (config.isolationLevel) chunks.push(`isolation level ${config.isolationLevel}`);",
      "    if (config.accessMode) chunks.push(config.accessMode);",
      "    if (typeof config.deferrable === \"boolean\") chunks.push(config.deferrable ? \"deferrable\" : \"not deferrable\");",
      "    return sql.raw(chunks.join(\" \"));",
      "  }",
      "  setTransaction(config) {",
      "    return this.session.execute(sql`set transaction ${this.getTransactionConfigSQL(config)}`);",
      "  }",
      "};",
      "const migrate = Effect.fn(\"migrate\")(function* (migrations, session, config) {",
      "  const migrationsTable = typeof config === \"string\" ? \"__drizzle_migrations\" : config.migrationsTable ?? \"__drizzle_migrations\";",
      "  const migrationsSchema = typeof config === \"string\" ? \"drizzle\" : config.migrationsSchema ?? \"drizzle\";",
      "  yield* session.execute(sql`CREATE SCHEMA IF NOT EXISTS ${sql.identifier(migrationsSchema)}`);",
      "  const { newDb } = yield* upgradeIfNeeded(migrationsSchema, migrationsTable, session, migrations);",
      "  if (newDb) {",
      "    const migrationTableCreate = sql`",
      "      CREATE TABLE IF NOT EXISTS ${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)} (",
      "        id SERIAL PRIMARY KEY,",
      "        hash text NOT NULL,",
      "        created_at bigint,",
      "        name text,",
      "        applied_at timestamp with time zone DEFAULT now()",
      "      )",
      "    `;",
      "    yield* session.execute(migrationTableCreate);",
      "  }",
      "  const dbMigrations = yield* session.all(sql`select id, hash, created_at, name from ${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)}`);",
      "  if (typeof config === \"object\" && config.init) {",
      "    if (dbMigrations.length) return yield* new MigratorInitError({ exitCode: \"databaseMigrations\" });",
      "    if (migrations.length > 1) return yield* new MigratorInitError({ exitCode: \"localMigrations\" });",
      "    const [migration] = migrations;",
      "    if (!migration) return;",
      "    yield* session.execute(sql`insert into ${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)} (\"hash\", \"created_at\", \"name\") values(${migration.hash}, ${migration.folderMillis}, ${migration.name})`);",
      "    return;",
      "  }",
      "  const migrationsToRun = getMigrationsToRun({ localMigrations: migrations, dbMigrations });",
      "  yield* session.transaction((tx) => Effect.gen(function* () {",
      "    for (const migration of migrationsToRun) {",
      "      for (const stmt of migration.sql) yield* tx.execute(sql.raw(stmt));",
      "      yield* tx.execute(sql`insert into ${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)} (\"hash\", \"created_at\", \"name\") values(${migration.hash}, ${migration.folderMillis}, ${migration.name})`);",
      "    }",
      "  }));",
      "});",
      "",
      "export { PgEffectPreparedQuery, PgEffectSession, PgEffectTransaction, migrate };",
      "",
    ].join("\n"),
    "utf8",
  );
}

function fileContains(filePath: string, needle: string) {
  if (!existsSync(filePath)) {
    return false;
  }

  return readFileSync(filePath, "utf8").includes(needle);
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
