# Zero Server Source Map

As of July 13, 2026, this is the file-level map for the Zero server integration work in this repo.

This document exists to answer one question precisely:

- which files define the Zero server contract we need to implement and test?

It intentionally separates:

- the local Promise-control lane
- the publishable Effect v3 adapter target
- the publishable Effect v4 adapter target
- the upstream Rocicorp source files that define the real behavior

## Hard Lane Split

These lanes are intentionally not the same implementation.

- Promise control
  `examples/ztunes` uses `zeroPostgresJS` and exists to prove the fixture, route wiring, and Zero protocol loop.
- Effect v3 target
  `packages/effect-zero-v3` must implement a custom Zero `DBConnection` backed by Drizzle Effect Postgres on Effect v3.
- Effect v4 target
  `packages/effect-zero-v4` must implement a custom Zero `DBConnection` backed by Drizzle RC Effect Postgres support and the pinned Effect v4 migration guidance.
- Local Node harness
  `examples/api` is the local-only API surface for exercising the complete control/v3/v4 target matrix in one process.

Important runtime boundary:

- `examples/ztunes` is the Cloudflare-style worker path and must stay request-scoped.
- `examples/api` may share TCP resources because it is not the deployment target. It exists to validate and benchmark the publishable adapters locally.

If a file uses `zeroPostgresJS`, it belongs to the control lane, not the publishable v3/v4 implementation.

## 1. Upstream Zero Contract Files

These files define the interfaces and protocol shapes our adapters must satisfy.

- `.context/rocicorp-mono/packages/zql/src/mutate/custom.ts`
  Core contract for `DBConnection`, `DBTransaction`, `wrappedTransaction`, `query()`, and `runQuery()`.
- `.context/rocicorp-mono/packages/zero-types/src/default-types.ts`
  Default registration surface for Zero schema, context, and wrapped transaction typing.
- `.context/rocicorp-mono/packages/zero-types/src/schema.ts`
  Core schema typing for Zero tables and relationships.
- `.context/rocicorp-mono/packages/zero-types/src/server-schema.ts`
  Server-side schema typing passed into query execution.
- `.context/rocicorp-mono/packages/zero-protocol/src/push.ts`
  Push protocol types for mutation requests and mutation result persistence.
- `.context/rocicorp-mono/packages/zero-protocol/src/custom-queries.ts`
  Query transform protocol types for `handleQueryRequest`.
- `.context/rocicorp-mono/packages/zero-protocol/src/ast.ts`
  Query AST type used by `runQuery()`.

## 2. Upstream Zero Server Request Pipeline

These files are the real server behavior to mirror.

- `.context/rocicorp-mono/packages/zero-server/src/process-mutations.ts`
  `handleMutateRequest`, transaction provider hooks, request parsing, LMID advancement, and mutation result writes.
- `.context/rocicorp-mono/packages/zero-server/src/queries/process-queries.ts`
  `handleQueryRequest`, request parsing, AST mapping, and query error response behavior.
- `.context/rocicorp-mono/packages/zero-server/src/custom.ts`
  Server custom mutator helper surface that sits alongside the mutation pipeline.
- `.context/rocicorp-mono/packages/zero-server/src/mod.ts`
  Public exports for the Zero server package.
- `.context/rocicorp-mono/packages/zero-server/src/logging.ts`
  Request-level log context creation used by the server handlers.

## 3. Upstream Zero Adapter Reference Files

These are the closest implementation references for our custom adapters.

- `.context/rocicorp-mono/packages/zero-server/src/adapters/postgresjs.ts`
  Smallest built-in `DBConnection` example. This is the control-lane reference.
- `.context/rocicorp-mono/packages/zero-server/src/adapters/drizzle.ts`
  Best shape reference for exposing a wrapped Drizzle transaction through Zero.
- `.context/rocicorp-mono/packages/zero-server/src/adapters/pg.ts`
  Additional Postgres adapter reference for transaction wrapping.
- `.context/rocicorp-mono/packages/zero-server/src/zql-database.ts`
  `ZQLDatabase` wrapper used by the adapters to expose `.run()` and transaction behavior.
- `.context/rocicorp-mono/packages/zero-server/src/pg-query-executor.ts`
  Query execution path behind `DBTransaction.runQuery()`.
- `.context/rocicorp-mono/packages/zero-server/src/schema.ts`
  Schema helpers used by the server-side database layer.

### How The Upstream Drizzle Adapter Actually Works

The upstream Drizzle adapter is intentionally very small.

- `.context/rocicorp-mono/packages/zero-server/src/adapters/drizzle.ts`
  `zeroDrizzle(schema, client)` returns `new ZQLDatabase(new DrizzleConnection(client), schema)`.
- `DrizzleConnection.transaction(...)`
  Delegates directly to `drizzle.transaction(...)` and wraps the Drizzle transaction in `DrizzleInternalTransaction`.
- `DrizzleInternalTransaction.wrappedTransaction`
  Exposes the original Drizzle transaction to caller code. This is a required behavior, not a convenience.
- `DrizzleInternalTransaction.runQuery(...)`
  Delegates to `executePostgresQuery(...)` so Zero can run AST-based queries through the same transaction.
- `DrizzleInternalTransaction.query(sql, params)`
  Uses the Drizzle session internals to prepare and execute raw SQL, then normalizes the result with `toIterableRows(...)`.
- `toIterableRows(...)`
  Normalizes arrays, iterables, or `{ rows }` result objects into the `Iterable<Row>` shape that Zero expects.

Important implementation constraint:

- the upstream adapter reaches into `wrappedTransaction._.session.prepareQuery(...)`
- that means the adapter is relying on Drizzle internals, not only a documented high-level API
- we should expect the Effect v3 and v4 adapters to need a version-specific raw-query bridge, especially on the v4 branch

## 3A. Effect v4 Migration Reference Files

These files are mandatory inputs for the v4 adapter lane.

- `/Users/am/Coding/2026/effect-zero/docs/EFFECT_V4_MIGRATION_REFERENCES.md`
  Canonical repo-local v4 migration/reference note.
- `.context/effect-v4-beta/MIGRATION.md`
  Authoritative Effect v3 to v4 migration guide.
- `.context/effect-v4-beta/migration/runtime.md`
  Required because runtime ownership changed in v4.
- `.context/effect-v4-beta/migration/services.md`
  Required because service creation and lookup changed in v4.
- `drizzle-orm@1.0.0-rc.4` `effect-postgres/driver`
  Current Drizzle RC database construction path.
- `drizzle-orm@1.0.0-rc.4` `effect-postgres/session`
  Current Drizzle RC transaction and raw/prepared query path.
- `drizzle-orm@1.0.0-rc.4` `pg-core/effect/session`
  Lower-level Effect query/session mechanics under the Drizzle RC implementation.

## 4. Upstream Tests To Port In Spirit

These are the upstream files that define the behaviors we should reproduce in package tests.

- `.context/rocicorp-mono/packages/zero-server/src/adapters/adapters.pg.test.ts`
  Adapter-level behavior, wrapped transaction exposure, read/write portability.
- `.context/rocicorp-mono/packages/zero-server/src/adapters/drizzle.test.ts`
  Drizzle-specific adapter expectations.
- `.context/rocicorp-mono/packages/zero-server/src/process-mutations.test.ts`
  Request-level mutation semantics, parse failures, and mutation flow behavior.
- `.context/rocicorp-mono/packages/zero-server/src/queries/process-queries.test.ts`
  Request-level query semantics and query error behavior.
- `.context/rocicorp-mono/packages/zero-server/src/zql-database.pg.test.ts`
  LMID and mutation-result hooks around the transaction provider.
- `.context/rocicorp-mono/packages/zero-server/src/custom.pg.test.ts`
  Additional custom mutator server-path behavior.
- `.context/rocicorp-mono/packages/zero-server/src/query.pg.test.ts`
  Query execution behavior against Postgres.

### Concrete Drizzle Behaviors The Upstream Tests Assert

The Drizzle adapter tests are not just smoke tests. They define the real compatibility bar.

- native Drizzle insert followed by `zql.run(...)` must read the same row back
- `tx.dbTransaction.query(...)` must allow raw SQL reads inside the Zero transaction
- `tx.dbTransaction.wrappedTransaction.query.user.findFirst(...)` must allow native Drizzle query APIs inside the same transaction
- CRUD mutator helpers must support:
  - insert
  - upsert with full payload
  - upsert with partial payload
  - update with omitted fields preserved
  - delete
- inferred and explicit `DrizzleTransaction<...>` typing must remain usable
- exported adapter types must not leak unstable internal Drizzle type paths

The minimal tests we should port first for v3 and v4 are:

- query path: direct Drizzle write, then `zql.run(...)`
- raw SQL path: `tx.dbTransaction.query(...)`
- wrapped transaction path: `tx.dbTransaction.wrappedTransaction...`
- mutation path: `exerciseMutations(...)` style CRUD flow
- type portability path: public exported types compile without referencing internal-only paths

## 5. ztunes Reference Integration Files

These are the best end-to-end reference files for TanStack Start plus Zero.

- `.context/rocicorp-ztunes/zero/schema.ts`
  Reference Zero schema shape and naming.
- `.context/rocicorp-ztunes/zero/auth.ts`
  Reference request context shape used by queries and mutators.
- `.context/rocicorp-ztunes/zero/queries.ts`
  Query fixtures worth mirroring: list queries, point queries, and related reads.
- `.context/rocicorp-ztunes/zero/mutators.ts`
  Mutation fixtures worth mirroring: `cart.add` and `cart.remove`.
- `.context/rocicorp-ztunes/app/routes/api/zero/query.ts`
  Canonical TanStack Start query route using `handleQueryRequest`.
- `.context/rocicorp-ztunes/app/routes/api/zero/mutate.ts`
  Canonical TanStack Start mutation route using `handleMutateRequest`.
- `.context/rocicorp-ztunes/app/routes/api/mutators/$.ts`
  Simpler direct mutator endpoint for debugging outside the full push protocol.
- `.context/rocicorp-ztunes/app/components/zero-init.tsx`
  Client bootstrap with `ZeroProvider`, context injection, and preload strategy.
- `.context/rocicorp-ztunes/app/router.tsx`
  Router context pattern for storing the `zero` client instance.

## 6. Local Promise-Control Files

These files are the current working local Zero surface. They validate the fixture and protocol shape, but they are not the v3/v4 package implementation.

### Shared Schema Source Of Truth

- `packages/example-data/src/db/schema.ts`
  Single Drizzle Postgres schema used across the control lane, v3 lane, and v4 lane for the fixture tables.
- `packages/example-data/src/zero/schema.ts`
  Generated Zero schema artifact produced by `drizzle-zero`.
- `packages/example-data/drizzle.config.ts`
  Drizzle migration entrypoint for the shared schema package.
- `packages/example-data/drizzle-zero.config.ts`
  `drizzle-zero` config that keeps the generated Zero schema scoped to the fixture tables.
- `packages/example-data/src/generated/migration-manifest.ts`
  Checked-in runtime manifest generated from the Drizzle SQL files for worker-safe migration application.
- `packages/example-data/src/migrations.ts`
  Shared migration runner that applies the generated fixture migrations without filesystem access and adopts the old handwritten fixture schema into the Drizzle ledger on first boot.
- `packages/example-data/scripts/build-migration-manifest.mjs`
  Regenerates the runtime manifest from `drizzle/meta/_journal.json` and the generated SQL files after `db:generate`.
- `packages/example-data/drizzle/`
  Generated SQL migrations and metadata for the fixture tables.

Important boundary:

- Zero runtime tables such as `zero_0.clients` and `zero_0.mutations` are not part of the shared fixture schema package.
- `zero-server` expects those tables to exist but does not provision them.
- `zero-cache` provisions them.
- In the current Promise-control lane, `examples/ztunes` still provisions those tables separately because it calls `handleMutateRequest` directly instead of going through `zero-cache`.

### Server and Database Wiring

- `examples/ztunes/app/server/promise-handler.ts`
  Request-scoped Promise-control orchestration using `zeroPostgresJS`.
- `examples/ztunes/app/server/targets.ts` and `proxy.ts`
  Worker-safe target selection and forwarding into the local Node harness.
- `examples/ztunes/app/routes/api/zero/`, `api/zql/`, `api/mutators/`, and `api/demo/`
  Worker-facing Zero protocol, direct mutator, read, reset, and state routes.

## 6A. Local Node Harness Files

- `examples/api/src/server.ts` and `examples/api/src/targets.ts`
  Node-only adapter harness that exposes the same demo, mutator, Zero mutate, and Zero query routes for `control`, `v3`, and `v4`.
- `tools/verify-api-targets.mjs`
  Sequential verifier for the shared route fixtures. Use `pnpm verify:api` for the worker-facing path and `pnpm verify:api:package` for the direct harness.
- `benchmarks/run-api-benchmarks.mjs`
  Shared benchmark runner. The full comparison matrix targets `examples/api`; the reduced worker-facing matrix targets `examples/ztunes`.

### Schema, Query, and Mutator Definitions

- `packages/example-data/src/zero/`, `queries.ts`, and `mutators/`
  Shared generated schema, query registry/builders, and cart mutators used by every target.
- `packages/test-utils/src/api-fixtures.ts`
  Shared request fixtures and target vocabulary for verification and benchmarks.

## 7. Package Targets For The Real Adapter Work

These files are the actual publishable surfaces we will turn into real adapter implementations.

- `packages/test-utils/src/index.ts`
  Shared contract vocabulary, scenario matrix, and benchmark plan expansion.
- `packages/test-utils/__tests__/index.test.ts`
  Shared contract assertions for the package lines.
- `packages/effect-zero-v3/src/index.ts`
  Public v3 package surface and current implementation. It builds the Effect runtime, creates the Drizzle Effect Postgres database, exposes the Zero `DBConnection`, and provides the Zero provider factory. It must remain on the Drizzle Effect Postgres path, not `zeroPostgresJS`.
- `packages/effect-zero-v3/tests/index.test.ts`
  Current v3 scaffold contract and benchmark-plan tests.
- `packages/effect-zero-v3/tests/dbconnection.test.ts`
  Current v3 adapter integration tests. These are the first real upstream-behavior ports and prove ZQL reads, raw SQL, wrapped transaction access, and request-level mutation handling.
- `packages/test-utils/src/postgres-test-db.ts`
  Shared Postgres database harness for v3 and v4 adapter tests. This file provisions the shared fixture schema through the migration runner and creates Zero control tables only for test databases.
- `packages/effect-zero-v4/src/index.ts`
  Public v4 package surface. Must remain on the Drizzle Effect v4 branch/PR path, not `zeroPostgresJS`.
- `packages/effect-zero-v4/tests/index.test.ts`
  Current v4 scaffold tests.

Current implementation note:

- the v3 adapter intentionally still lives in one explicit file instead of being split across multiple wrappers
- that matches the repo's agent-first preference for linear, easily regenerable code
- split it only when there is a clear behavioral boundary worth isolating

## 8. Documentation Files That Define Repo Policy

- `ACCEPTANCE_CRITERIA.md`
  Canonical publish gates and parity requirements.
- `../tools/verify-package-api.mjs`
  Executable control/v3/v4 package-identity lane split.
- `README.md`
  Repo overview and lane summary.

## 9. Test Mechanisms To Cover

The file list above maps to these concrete mechanisms that must be tested.

- `DBConnection.transaction()`
  The custom v3/v4 adapters must provide Zero-compatible transaction entry.
- `DBTransaction.wrappedTransaction`
  Callers must retain access to the underlying Drizzle transaction.
- `DBTransaction.query()`
  Raw SQL path used by Zero internals must work on the wrapped transaction.
- `DBTransaction.runQuery()`
  AST-based query execution path must work for Zero query handling.
- Drizzle relational query execution
  On the current v3 beta stack, native relational queries from `wrappedTransaction.query.*` are effectful query builders and need `.execute()` in tests and callers.
- `handleMutateRequest`
  Must parse requests, execute mutators, advance LMID, and write mutation results.
- `handleQueryRequest`
  Must parse requests and return transformed AST responses with correct errors.
- direct mutator route
  Must work as a simpler fixture for targeted write-path debugging.
- seed/reset path
  Must be deterministic so benchmarks and comparisons are meaningful.

## 10. Immediate Reading Order

If starting fresh, read in this order:

1. `.context/rocicorp-mono/packages/zql/src/mutate/custom.ts`
2. `.context/rocicorp-mono/packages/zero-server/src/process-mutations.ts`
3. `.context/rocicorp-mono/packages/zero-server/src/queries/process-queries.ts`
4. `.context/rocicorp-mono/packages/zero-server/src/adapters/drizzle.ts`
5. `.context/rocicorp-mono/packages/zero-server/src/adapters/postgresjs.ts`
6. `.context/rocicorp-ztunes/zero/schema.ts`
7. `.context/rocicorp-ztunes/zero/queries.ts`
8. `.context/rocicorp-ztunes/zero/mutators.ts`
9. `packages/example-data/src/zero/schema.ts`
10. `packages/example-data/src/queries.ts`
11. `packages/example-data/src/mutators/`
12. `examples/api/src/targets.ts`
13. `packages/effect-zero-v3/src/index.ts`
14. `packages/effect-zero-v3/tests/dbconnection.test.ts`
15. `EFFECT_V4_MIGRATION_REFERENCES.md`
