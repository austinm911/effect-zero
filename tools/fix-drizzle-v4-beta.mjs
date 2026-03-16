import {
  appendFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const effectV4PackageRoot = path.join(repoRoot, "packages/effect-zero-v4");

const requireFromV4 = createRequire(path.join(effectV4PackageRoot, "package.json"));

let driverPath;

try {
  driverPath = requireFromV4.resolve("drizzle-orm/effect-postgres/driver");
} catch {
  console.log("[fix-drizzle-v4-beta] drizzle-orm/effect-postgres is not installed yet");
  process.exit(0);
}

const effectPath = requireFromV4.resolve("effect/Effect");
const drizzleNodeModules = path.resolve(path.dirname(driverPath), "..", "..");
const drizzlePackageRoot = path.resolve(path.dirname(driverPath), "..");
const effectPackageRoot = path.resolve(path.dirname(effectPath), "..");
const effectLinkPath = path.join(drizzleNodeModules, "effect");
const effectLinkTarget = path.relative(drizzleNodeModules, effectPackageRoot);
const effectModulePath = path.join(effectPackageRoot, "dist/Effect.js");
const effectServiceCompatModulePath = path.join(effectPackageRoot, "dist/ServiceCompat.js");
const effectableModulePath = path.join(effectPackageRoot, "dist/Effectable.js");
const schemaModulePath = path.join(effectPackageRoot, "dist/Schema.js");
const drizzleSessionModulePath = path.join(drizzlePackageRoot, "effect-postgres/session.js");
const drizzlePgCoreSessionModulePath = path.join(drizzlePackageRoot, "pg-core/effect/session.js");

ensureDirectory(path.dirname(effectLinkPath));
replaceLink(effectLinkPath, effectLinkTarget);
ensureEffectServiceCompatShim(effectServiceCompatModulePath);
ensureEffectServiceShim(effectModulePath);
ensureEffectableShim(effectableModulePath);
ensureTaggedErrorShim(schemaModulePath);
ensurePatchedDrizzlePgCoreSession(drizzlePgCoreSessionModulePath);
ensurePatchedDrizzleSession(drizzleSessionModulePath);

console.log("[fix-drizzle-v4-beta] prepared v4 Drizzle beta runtime", {
  drizzleNodeModules,
  effectLinkTarget,
  effectableModulePath,
});

function ensureDirectory(directoryPath) {
  mkdirSync(directoryPath, { recursive: true });
}

function replaceLink(linkPath, targetPath) {
  try {
    const existing = lstatSync(linkPath);

    if (existing.isSymbolicLink() || existing.isDirectory() || existing.isFile()) {
      rmSync(linkPath, { force: true, recursive: true });
    }
  } catch {}

  symlinkSync(targetPath, linkPath, "dir");
}

function ensureEffectServiceCompatShim(modulePath) {
  writeFileSync(
    modulePath,
    [
      'import * as Layer from "./Layer.js";',
      'import * as ServiceMap from "./ServiceMap.js";',
      "",
      "export const Service = () => {",
      "  return (key, maker) => {",
      "    const tag = ServiceMap.Service(key);",
      '    const sample = "sync" in maker ? maker.sync() : "succeed" in maker ? maker.succeed : {};',
      "    class TagClass {",
      "      constructor(service) {",
      "        Object.assign(this, service);",
      "      }",
      "    }",
      "    Object.setPrototypeOf(TagClass, tag);",
      '    Object.defineProperty(TagClass, "Service", {',
      "      value: { _tag: tag.asEffect() },",
      "      configurable: true,",
      "      enumerable: false,",
      "      writable: false,",
      "    });",
      "    let defaultLayer;",
      '    Object.defineProperty(TagClass, "Default", {',
      "      get() {",
      "        return defaultLayer ??= Layer.succeed(TagClass, new TagClass(sample));",
      "      },",
      "      configurable: true,",
      "      enumerable: false,",
      "    });",
      "    if (maker.accessors === true) {",
      "      for (const property of Object.keys(sample)) {",
      '        if (typeof sample[property] !== "function") {',
      "          continue;",
      "        }",
      "        Object.defineProperty(TagClass, property, {",
      "          value: (...args) => tag.use((service) => service[property](...args)),",
      "          configurable: true,",
      "          enumerable: false,",
      "          writable: false,",
      "        });",
      "      }",
      "    }",
      "    return TagClass;",
      "  };",
      "};",
      "",
    ].join("\n"),
    "utf8",
  );
}

function ensureEffectServiceShim(modulePath) {
  const currentSource = readFileSync(modulePath, "utf8");
  const normalizedSource = currentSource
    .replaceAll(
      '\nimport * as ServiceMap from "./ServiceMap.js";\nexport const Service = ServiceMap.Service;\n',
      "\n",
    )
    .replaceAll("\nexport const Service = ServiceMap.Service;\n", "\n")
    .replace(/\nexport \{ Service \} from "\.\/ServiceCompat\.js";\n/g, "\n")
    .replace(/\nexport const catchAll = .*;\n/g, "\n")
    .replace(/\nexport const catchAllCause = .*;\n/g, "\n")
    .replace(/\nexport const catchAllDefect = .*;\n/g, "\n")
    .replace(
      /\nexport \{ catch_ as catchAll, catchCause as catchAllCause, catchDefect as catchAllDefect \};\n/g,
      "\n",
    );

  const compatibilityFooter = [
    'export { Service } from "./ServiceCompat.js";',
    "export { catch_ as catchAll, catchCause as catchAllCause, catchDefect as catchAllDefect };",
    "",
  ].join("\n");

  if (
    !normalizedSource.includes('export { Service } from "./ServiceCompat.js";') ||
    !normalizedSource.includes(
      "export { catch_ as catchAll, catchCause as catchAllCause, catchDefect as catchAllDefect };",
    )
  ) {
    writeFileSync(modulePath, `${normalizedSource.trimEnd()}\n${compatibilityFooter}`, "utf8");
    return;
  }

  if (normalizedSource !== currentSource) {
    writeFileSync(modulePath, normalizedSource, "utf8");
  }
}

function ensureEffectableShim(modulePath) {
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

function ensureTaggedErrorShim(modulePath) {
  const currentSource = readFileSync(modulePath, "utf8");

  if (currentSource.includes("export const TaggedError =")) {
    return;
  }

  appendFileSync(
    modulePath,
    [
      "",
      "export const TaggedError = (identifier) => {",
      "  return (tagValue, schema, annotations) => TaggedErrorClass(identifier)(tagValue, schema, annotations);",
      "};",
      "",
    ].join("\n"),
    "utf8",
  );
}

function ensurePatchedDrizzleSession(modulePath) {
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
      "    const self = this;",
      "    const { dialect, relations, schema } = self;",
      "    return self.client.withTransaction(",
      "      Effect.gen(function* () {",
      "        return yield* transaction(new EffectPgTransaction(dialect, self, relations, schema));",
      "      }),",
      "    );",
      "  }",
      "};",
      "var EffectPgTransaction = class extends PgEffectTransaction {",
      '  static [entityKind] = "EffectPgTransaction";',
      "};",
      "",
      "export { EffectPgPreparedQuery, EffectPgSession, EffectPgTransaction };",
      "//# sourceMappingURL=session.js.map",
      "",
    ].join("\n"),
    "utf8",
  );
}

function ensurePatchedDrizzlePgCoreSession(modulePath) {
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
      '    if (cache && cache.strategy() === "all" && cacheConfig === void 0) this.cacheConfig = {',
      "      enabled: true,",
      "      autoInvalidate: true",
      "    };",
      "    if (!this.cacheConfig?.enabled) this.cacheConfig = void 0;",
      "  }",
      "  queryWithCache(queryString, params, query) {",
      "    const self = this;",
      "    return Effect.gen(function* () {",
      "      const { cacheConfig, queryMetadata } = self;",
      "      const cache = yield* EffectCache;",
      '      const cacheStrat = cache && !is(cache.cache, NoopCache) ? yield* Effect.tryPromise(() => strategyFor(queryString, params, queryMetadata, cacheConfig)) : { type: "skip" };',
      '      if (cacheStrat.type === "skip") return yield* query;',
      '      if (cacheStrat.type === "invalidate") {',
      "        const result = yield* query;",
      "        yield* cache.onMutate({ tables: cacheStrat.tables });",
      "        return result;",
      "      }",
      '      if (cacheStrat.type === "try") {',
      "        const { tables, key, isTag, autoInvalidate, config } = cacheStrat;",
      "        const fromCache = yield* cache.get(key, tables, isTag, autoInvalidate);",
      '        if (typeof fromCache !== "undefined") return fromCache;',
      "        const result = yield* query;",
      "        yield* cache.put(key, result, autoInvalidate ? tables : [], isTag, config);",
      "        return result;",
      "      }",
      "      assertUnreachable(cacheStrat);",
      "    }).pipe(",
      "      Effect.provideService(EffectCache, self.cache),",
      "      Effect.catch((e) => {",
      "        return new EffectDrizzleQueryError({",
      "          query: queryString,",
      "          params,",
      "          cause: Cause.fail(e)",
      "        });",
      "      })",
      "    );",
      "  }",
      "};",
      "var PgEffectSession = class extends PgSession {",
      '  static [entityKind] = "PgEffectSession";',
      "  constructor(dialect) {",
      "    super(dialect);",
      "  }",
      "  execute(query) {",
      "    const { sql: sql$1, params } = this.dialect.sqlToQuery(query);",
      "    return this.prepareQuery({",
      "      sql: sql$1,",
      "      params",
      "    }, void 0, void 0, false).execute();",
      "  }",
      "  all(query) {",
      "    const { sql: sql$1, params } = this.dialect.sqlToQuery(query);",
      "    return this.prepareQuery({",
      "      sql: sql$1,",
      "      params",
      "    }, void 0, void 0, false).all();",
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
      "    return new EffectTransactionRollbackError();",
      "  }",
      "  getTransactionConfigSQL(config) {",
      "    const chunks = [];",
      "    if (config.isolationLevel) chunks.push(`isolation level ${config.isolationLevel}`);",
      "    if (config.accessMode) chunks.push(config.accessMode);",
      '    if (typeof config.deferrable === "boolean") chunks.push(config.deferrable ? "deferrable" : "not deferrable");',
      '    return sql.raw(chunks.join(" "));',
      "  }",
      "  setTransaction(config) {",
      "    return this.session.execute(sql`set transaction ${this.getTransactionConfigSQL(config)}`);",
      "  }",
      "};",
      'const migrate = Effect.fn("migrate")(function* (migrations, session, config) {',
      '  const migrationsTable = typeof config === "string" ? "__drizzle_migrations" : config.migrationsTable ?? "__drizzle_migrations";',
      '  const migrationsSchema = typeof config === "string" ? "drizzle" : config.migrationsSchema ?? "drizzle";',
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
      '  if (typeof config === "object" && config.init) {',
      '    if (dbMigrations.length) return yield* new MigratorInitError({ exitCode: "databaseMigrations" });',
      '    if (migrations.length > 1) return yield* new MigratorInitError({ exitCode: "localMigrations" });',
      "    const [migration] = migrations;",
      "    if (!migration) return;",
      `    yield* session.execute(sql\`insert into \${sql.identifier(migrationsSchema)}.\${sql.identifier(migrationsTable)} ("hash", "created_at", "name") values(\${migration.hash}, \${migration.folderMillis}, \${migration.name})\`);`,
      "    return;",
      "  }",
      "  const migrationsToRun = getMigrationsToRun({",
      "    localMigrations: migrations,",
      "    dbMigrations",
      "  });",
      "  yield* session.transaction((tx) => Effect.gen(function* () {",
      "    for (const migration of migrationsToRun) {",
      "      for (const stmt of migration.sql) yield* tx.execute(sql.raw(stmt));",
      `      yield* tx.execute(sql\`insert into \${sql.identifier(migrationsSchema)}.\${sql.identifier(migrationsTable)} ("hash", "created_at", "name") values(\${migration.hash}, \${migration.folderMillis}, \${migration.name})\`);`,
      "    }",
      "  }));",
      "});",
      "",
      "export { PgEffectPreparedQuery, PgEffectSession, PgEffectTransaction, migrate };",
      "//# sourceMappingURL=session.js.map",
      "",
    ].join("\n"),
    "utf8",
  );
}
