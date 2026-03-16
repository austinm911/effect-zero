# Effect Zero Implementation Tracker

This file tracks the implementation path for the two publishable adapter lines:

- `@effect-zero/v3`
- `@effect-zero/v4`

The goal is not just to compile. The goal is to prove that both packages can:

- implement a Zero-compatible `DBConnection`
- expose a Zero-compatible server `dbProvider`
- interoperate with a direct Drizzle baseline
- run the same query and mutation fixtures through the same benchmark matrix
- be exercised through a TanStack Start integration app

Canonical spec:

- `/Users/am/Coding/2026/effect-zero/docs/ACCEPTANCE_CRITERIA.md`
  This is the single source of truth for acceptance criteria and publish gates.
- `/Users/am/Coding/2026/effect-zero/docs/EFFECT_ZERO_COMPARISON.md`
  Comparison with `realms-labs/effect-zero` and the mutator API direction.
- `/Users/am/Coding/2026/effect-zero/docs/MUTATOR_API_OPTIONS.md`
  Valterra comparison, API options, and the transaction-parity test matrix.
- `/Users/am/Coding/2026/effect-zero/docs/DESIRED_MUTATOR_API.md`
  Canonical target mutator API, file layout, and v3/v4 service patterns.

## Current State

- [x] Monorepo scaffolded with Vite+
- [x] Shared contract package exists
- [x] Shared benchmark scenario matrix exists
- [x] Shared Drizzle schema package exists
- [x] Shared Zero schema is generated from Drizzle via `drizzle-zero`
- [x] Shared Drizzle migration artifacts exist for the fixture tables
- [x] Shared runtime migration manifest exists for worker-safe fixture bootstrap
- [x] Shared migration runner exists for applying fixture migrations at runtime
- [x] v3 package scaffold exists
- [x] v4 package scaffold exists
- [x] Upstream reference repos cloned into `.context/`
- [x] `pnpm dev` boots the Alchemy app and local Postgres together
- [x] API-verifiable Promise-control mutation and query loop exists in `apps/web`
- [x] Promise-control fixture bootstrap and reset are serialized to avoid first-request races
- [x] Browser automation re-verification completed against `apps/web`
- [x] Real `createDbConnection()` implementation in v3
- [x] Real `createDbConnection()` implementation in v4
- [x] Real `dbProvider` bridge in v3
- [x] Real `dbProvider` bridge in v4
- [x] Drizzle interop implementation in v3
- [x] Drizzle interop implementation in v4
- [x] TanStack Start integration app
- [x] Control-lane API benchmark runner and persisted results
- [x] Package-lane benchmark results for v3 and v4
- [x] Local Node harness exists for package-lane verification and benchmarking
- [x] Worker-facing web verifier exists for control, v3, and v4
- [x] Reduced worker-facing benchmark profile exists for the Cloudflare-style route path
- [x] Effect-native server mutator API exists for v3
- [x] Effect-native server mutator API exists for v4
- [x] Zero-lane mutator invariants and mutation-stress coverage exist as executable tests
- [ ] Full cross-lane transaction-parity matrix exists as executable tests, not only docs

## TDD Note

Recent migration work followed a red-green step:

- RED
  `packages/example-data/tests/migrations.test.ts` was added first to require a shared runtime migration manifest, generated Drizzle migration assets, and the pre-migration cutover path.
- GREEN
  `packages/example-data/src/generated/migration-manifest.ts`, `packages/example-data/src/migrations.ts`, and `packages/example-data/scripts/build-migration-manifest.mjs` were added, then `apps/web` was switched to use the worker-safe runner for fixture tables.

Keep that same test-first pattern for the next slices:

- adapter transaction wrapper
- raw SQL bridge
- wrapped transaction exposure
- request-level mutate/query behavior

### v3 Adapter TDD Slice Completed

- RED
  `packages/effect-zero-v3/tests/dbconnection.test.ts` was expanded first to require:
  - Zero ZQL reads through a real adapter
  - raw SQL through `tx.dbTransaction.query(...)`
  - native Drizzle access through `tx.dbTransaction.wrappedTransaction`
  - request-level `handleMutateRequest(...)` through a Zero provider
- GREEN
  `packages/effect-zero-v3/src/index.ts` now implements the adapter and provider on top of `drizzle-orm/effect-postgres`.
- CLEANUP
  `apps/web/src/features/music-fixture/server.ts` now serializes fixture bootstrap and reset so the Promise-control lane stays deterministic under concurrent first requests.

### v4 Adapter TDD Slice Completed

- RED
  `packages/effect-zero-v4/tests/dbconnection.test.ts` required the same upstream Drizzle adapter behaviors as v3:
  - Zero ZQL reads through a real adapter
  - raw SQL through `tx.dbTransaction.query(...)`
  - native Drizzle access through `tx.dbTransaction.wrappedTransaction`
  - request-level `handleMutateRequest(...)` through a Zero provider
  - request-level `handleQueryRequest(...)` for the shared artist query fixture
- GREEN
  `packages/effect-zero-v4/src/index.ts` now implements the adapter and provider on top of the pinned Drizzle beta plus Effect v4.
- CLEANUP
  `tools/fix-drizzle-v4-beta.mjs` now rewrites the local Drizzle beta runtime to account for the current Effect v4 migration surface:
  - Effect export renames such as `catchAll` -> `catch`
  - missing `Effectable`, `Service`, and `Schema.TaggedError` compatibility points
  - generator `this` binding breakage in Drizzle's compiled `pg-core/effect/session.js` and `effect-postgres/session.js`

### Server Mutator API TDD Slice Completed

- RED
  `packages/effect-zero-v3/tests/server-mutators.test.ts` and `packages/effect-zero-v4/tests/server-mutators.test.ts` now require:
  - shared/default mutator composition through `runDefaultMutation()`
  - full replacement server overrides without calling `runDefaultMutation()`
  - lane-specific Effect service injection
  - deferred post-commit work
  - duplicate replay and out-of-order request semantics through the server mutator helper path
  - rollback when `runDefaultMutation()` is called more than once
- GREEN
  `packages/effect-zero-v3/src/server.ts` and `packages/effect-zero-v4/src/server.ts` now expose the typed server mutator helper surface used by the package harness and tests.
- CLEANUP
  `apps/package-api/src/music-fixture-server-mutators.ts` now keeps the lane-specific wiring explicit while sharing the actual cart SQL override bodies.

## Adapter Lanes

These lanes are intentionally separate and must not be conflated.

- Promise control
  `apps/web` uses Zero's built-in `zeroPostgresJS` adapter to validate the fixture, local stack, and Zero protocol shape.
- Effect v3 target
  `packages/effect-zero-v3` must use Drizzle Effect Postgres on Effect v3, not `zeroPostgresJS`.
- Effect v4 target
  `packages/effect-zero-v4` must use the Drizzle Effect v4 branch/PR path, not `zeroPostgresJS`.
- Local harness
  `apps/package-api` is the Node-only comparison and benchmark surface for the v3 and v4 TCP adapters.

Reference doc:

- `ADAPTER_TEST_MATRIX.md`
- `ZERO_SERVER_SOURCE_MAP.md`
- `EFFECT_V4_MIGRATION_REFERENCES.md`
- `EFFECT_ZERO_COMPARISON.md`

## Local Files That Already Matter

These are the current repo files that define the implementation boundary.

- `packages/test-utils/src/index.ts`
  Shared adapter manifest types, benchmark scenario matrix, target matrix expansion, and measurement summary math.
- `packages/test-utils/__tests__/index.test.ts`
  Shared contract expectations and benchmark-plan tests.
- `packages/example-data/src/db/schema.ts`
  Single Drizzle Postgres schema source of truth for the fixture.
- `packages/example-data/src/zero/schema.ts`
  Generated Zero schema artifact produced by `drizzle-zero`.
- `packages/example-data/src/migrations.ts`
  Shared migration runner used by the control lane and future adapter tests.
- `packages/example-data/src/generated/migration-manifest.ts`
  Checked-in runtime manifest generated from the Drizzle SQL files so worker runtimes do not depend on filesystem-based migration lookup.
- `packages/example-data/scripts/build-migration-manifest.mjs`
  Manifest generator that runs after `db:generate`.
- `packages/example-data/drizzle/`
  Generated Drizzle SQL migrations and metadata for the fixture tables.
- `packages/example-data/tests/index.test.ts`
  Shared schema smoke tests.
- `packages/example-data/tests/migrations.test.ts`
  Test-first migration coverage for generated artifacts and the shared migration runner.
- `packages/effect-zero-v3/src/index.ts`
  Current v3 public package surface, working adapter implementation, Zero provider bridge, and benchmark targets.
- `packages/effect-zero-v3/tests/index.test.ts`
  Current v3 scaffold contract and benchmark-plan assertions.
- `packages/effect-zero-v3/tests/dbconnection.test.ts`
  Current v3 integration tests for ZQL reads, raw SQL, wrapped Drizzle access, request-level mutation handling, request-level query handling, and direct native Drizzle writes.
- `packages/test-utils/src/postgres-test-db.ts`
  Shared Postgres database harness for v3 and v4 adapter tests, including shared-schema migration setup and local Zero control-table provisioning.
- `packages/effect-zero-v4/src/index.ts`
  Current v4 public package surface and benchmark targets.
- `packages/effect-zero-v4/tests/index.test.ts`
  Current v4 scaffold contract and benchmark-plan assertions.
- `packages/effect-zero-v4/tests/dbconnection.test.ts`
  Current v4 integration tests for ZQL reads, raw SQL, wrapped Drizzle access, request-level mutation handling, request-level query handling, and direct native Drizzle writes.
- `apps/package-api/src/server.ts`
  Local Node-only HTTP harness that hosts the control, v3, and v4 API surfaces for adapter verification and full benchmark runs.
- `apps/web/src/server/package-api.ts`
  Worker-safe local proxy from `apps/web` into the Node harness for non-control lanes.
- `tools/verify-api-targets.mjs`
  Sequential API verifier for `control`, `v3`, and `v4` through either the worker-facing app or the direct package harness.

## Upstream Reference Files To Mirror

These are the source files worth copying ideas from, not editing.

### Zero Server Contracts

- `.context/rocicorp-mono/packages/zql/src/mutate/custom.ts`
  Defines `DBConnection`, `DBTransaction`, and the transaction surface our packages must satisfy.
- `.context/rocicorp-mono/packages/zero-server/src/adapters/drizzle.ts`
  Reference implementation for `zeroDrizzle`, transaction wrapping, query execution delegation, and wrapped Drizzle transaction exposure.
- `.context/rocicorp-mono/packages/zero-server/src/adapters/postgresjs.ts`
  Reference implementation for `zeroPostgresJS`, especially the smallest viable `DBConnection` wrapper.
- `.context/rocicorp-mono/packages/zero-server/src/process-mutations.ts`
  Actual server mutation pipeline using `handleMutateRequest`.
- `.context/rocicorp-mono/packages/zero-server/src/queries/process-queries.ts`
  Actual server query pipeline using `handleQueryRequest`.
- `.context/rocicorp-mono/packages/zero-types/src/default-types.ts`
  Type-registration shape for `dbProvider`, `schema`, and `context`.

### Upstream Tests Worth Porting In Spirit

- `.context/rocicorp-mono/packages/zero-server/src/adapters/adapters.pg.test.ts`
  Best reference for adapter-level behavior. Covers querying, mutations, wrapped transaction access, and portability expectations.
- `.context/rocicorp-mono/packages/zero-server/src/zql-database.pg.test.ts`
  Best reference for transaction-hook behavior such as `updateClientMutationID()` and `writeMutationResult()`.
- `.context/rocicorp-mono/packages/zero-server/src/process-mutations.test.ts`
  Best reference for request-level mutation semantics, error handling, and LMID advancement.
- `.context/rocicorp-mono/packages/zero-server/src/queries/process-queries.test.ts`
  Best reference for request-level query semantics and parse/error behavior.

### ztunes Integration References

- `.context/rocicorp-ztunes/zero/mutators.ts`
  Good mutation fixture source. `cart.add` and `cart.remove` are enough to prove the loop.
- `.context/rocicorp-drizzle-zero/README.md`
  CLI behavior and generation workflow for deriving the Zero schema from the Drizzle schema.
- `.context/rocicorp-mono/packages/zero-server/src/process-mutations.ts`
  Reminder that Zero mutation processing expects upstream state tables to exist.
- `.context/rocicorp-mono/packages/zero-cache/src/services/change-source/pg/schema/shard.ts`
  Reference that `zero-cache`, not the shared fixture schema package, provisions the upstream Zero state tables.
- `.context/rocicorp-ztunes/zero/queries.ts`
  Good query fixture source. `getArtist`, `getCartItems`, and `getHomepageArtists` cover point lookups and list queries.
- `.context/rocicorp-ztunes/app/routes/api/zero/mutate.ts`
  Canonical TanStack Start route using `handleMutateRequest`.
- `.context/rocicorp-ztunes/app/routes/api/zero/query.ts`
  Canonical TanStack Start route using `handleQueryRequest`.
- `.context/rocicorp-ztunes/app/routes/api/mutators/$.ts`
  Useful simpler server route for direct mutator testing outside the full Zero push protocol.
- `.context/rocicorp-ztunes/app/components/zero-init.tsx`
  Canonical `ZeroProvider` boot path for the client.
- `.context/rocicorp-ztunes/app/router.tsx`
  Canonical TanStack router context shape for injecting `zero`.
- `.context/rocicorp-ztunes/app/routes/_layout/artist.tsx`
  Best end-to-end mutation fixture. Queries artist data and toggles cart mutations.
- `.context/rocicorp-ztunes/app/routes/_layout/cart.tsx`
  Best end-to-end query fixture. Confirms cart state changes round-trip into UI.
- `.context/rocicorp-ztunes/app/routes/_layout/index.tsx`
  Best range/list query fixture.

## Major Workstreams

## 1. Shared Extraction Boundary

- [ ] Keep shared items in `packages/test-utils` limited to pure types, fixtures, assertions, benchmark vocabulary, and result schemas.
- [ ] Keep the fixture schema itself in `packages/example-data`, not in the adapter packages or app code.
- [ ] Do not share Effect runtime code between v3 and v4 packages.
- [ ] Do not share package-level imports from `effect` across the v3 and v4 lines.
- [ ] Share only pure test fixtures and behavior assertions that are valid for both lines.
- [ ] Extract common benchmark-fixture names and expected result schemas before implementing runners.

Recommended shared candidates:

- Drizzle Postgres schema
- generated Zero schema artifact
- generated Drizzle migration artifacts for fixture tables
- benchmark scenario definitions
- benchmark result shape and serialization
- query and mutation fixture descriptors
- adapter contract assertions
- seeded test data constants

Keep version-specific:

- runtime/layer creation
- Effect wrappers around `transaction`
- error mapping from Effect failures into Promise failures
- package exports

## 2. Effect v3 Adapter

- [x] Add a dedicated runtime entry module for the v3 line.
- [x] Implement `createDbConnection()` for v3 against the stable Effect v3 runtime and Drizzle Effect Postgres.
- [x] Implement a v3 `DBTransaction` wrapper exposing `wrappedTransaction`, `query`, and `runQuery`.
- [x] Provide a v3 `dbProvider` that can be passed into `handleMutateRequest`.
- [x] Add a direct Drizzle Effect Postgres interop entrypoint for v3.
- [ ] Add structured timing and error hooks around the v3 transaction boundary.
- [x] Do not use Zero's `zeroPostgresJS` adapter in package implementation code.

Current implementation files:

- `packages/effect-zero-v3/src/index.ts`
  The v3 implementation is intentionally still in one explicit file. It contains the runtime setup, Zero transaction wrapper, raw SQL bridge, relation wiring, and provider factory.

## 3. Effect v4 Adapter

- [x] Read `EFFECT_V4_MIGRATION_REFERENCES.md` before changing v4 code.
- [x] Add a dedicated runtime entry module for the v4 line.
- [x] Implement `createDbConnection()` for v4 against the beta Effect v4 runtime and the pinned Drizzle beta source.
- [x] Implement a v4 `DBTransaction` wrapper exposing `wrappedTransaction`, `query`, and `runQuery`.
- [x] Provide a v4 `dbProvider` that can be passed into `handleMutateRequest`.
- [x] Add a direct Drizzle Effect v4 interop entrypoint for v4.
- [ ] Add structured timing and error hooks around the v4 transaction boundary.
- [x] Do not use Zero's `zeroPostgresJS` adapter in package implementation code.

Suggested file targets:

- `packages/effect-zero-v4/src/dbconnection.ts`
- `packages/effect-zero-v4/src/db-transaction.ts`
- `packages/effect-zero-v4/src/db-provider.ts`
- `packages/effect-zero-v4/src/drizzle.ts`
- `packages/effect-zero-v4/src/metrics.ts`

Pinned v4 research inputs:

- `.context/effect-v4-beta/MIGRATION.md`
- `.context/effect-v4-beta/migration/runtime.md`
- `.context/effect-v4-beta/migration/services.md`
- `.context/drizzle-orm-v1.0.0-beta.17/drizzle-orm/src/effect-postgres/driver.ts`
- `.context/drizzle-orm-v1.0.0-beta.17/drizzle-orm/src/effect-postgres/session.ts`

## 4. Package-Level Test Coverage

- [x] Add direct adapter behavior tests for v3 modeled after `adapters.pg.test.ts`.
- [x] Add direct adapter behavior tests for v4 modeled after `adapters.pg.test.ts`.
- [ ] Add transaction-hook tests modeled after `zql-database.pg.test.ts`.
- [x] Add request-level mutation tests for v3 `handleMutateRequest`.
- [x] Add request-level mutation tests for v4 `handleMutateRequest`.
- [x] Add request-level tests for `handleQueryRequest` in both v3 and v4 package lines.
- [x] Add adapter tests proving v3 `tx.dbTransaction.query(...)` works for raw SQL.
- [x] Add adapter tests proving v4 `tx.dbTransaction.query(...)` works for raw SQL.
- [x] Add adapter tests proving v3 `tx.dbTransaction.wrappedTransaction` exposes native Drizzle query APIs.
- [x] Add adapter tests proving v4 `tx.dbTransaction.wrappedTransaction` exposes native Drizzle query APIs.
- [ ] Add negative tests for auth/context absence.
- [ ] Add tests confirming wrapped transaction access remains available to callers.
- [x] Add tests that compare direct Drizzle writes against Zero mutator writes on the same dataset for v3.
- [x] Add tests that compare direct Drizzle writes against Zero mutator writes on the same dataset for v4.
- [ ] Add service-backed mutator tests for v3.
- [ ] Add service-backed mutator tests for v4.

Suggested test files:

- `packages/effect-zero-v3/tests/dbconnection.test.ts`
- `packages/test-utils/src/postgres-test-db.ts`
- `packages/effect-zero-v4/tests/dbconnection.test.ts`
- `packages/effect-zero-v4/tests/db-provider.test.ts`
- `packages/effect-zero-v4/tests/requests.test.ts`

## 5. Mutator API Surface

This is now a real implemented surface, not just a design note.

Desired outcome:

- users define server mutators with Effect-native handlers
- service requirements propagate through the handler type
- the helper integrates with the lane-specific adapter
- the default path runs exactly one adapter-backed transaction per mutator

Do not copy the Realms Labs `effect-zero` transaction model as the default.

Why:

- their package is a strong reference for schema-driven mutator authoring and service propagation
- but it deliberately allows post-commit code and multiple transaction entry points inside one logical mutator
- that is not the safest default for a publishable Zero adapter package

Checklist:

- [x] Design a v3 server mutator helper
- [x] Design a v4 server mutator helper
- [x] Keep the public shape aligned across lanes
- [x] Support validator/schema-driven arg decoding
- [x] Support lane-specific Effect service injection
- [x] Execute the whole logical mutator body inside one adapter-backed transaction by default
- [ ] Add tests for:
  - success path
  - validation failure
  - failure before commit
  - failure inside transaction
  - batched mutations
  - out-of-order handling
- [x] Add an integration path that uses the helper instead of calling `mustGetMutator(...).fn(...)` directly
- [x] Add request-level mutation stress coverage for sequential, batched, duplicate-replay, out-of-order, and parallel same-user patterns

## 6. Integration App

The repo uses `apps/web` as the canonical browser-facing example app and `apps/package-api` as the local Node harness for the publishable Effect v3/v4 adapters.

Recommended decision:

- use `apps/web` as the canonical verification surface
- keep `apps/web` on the Promise-control `zeroPostgresJS` path
- do not edit `.context/rocicorp-ztunes`

Checklist:

- [x] Scaffold `apps/web` with TanStack Start.
- [x] Add a minimal schema derived from the ztunes cart/artist fixture.
- [x] Add `zero/mutators.ts` using the ztunes cart pattern.
- [x] Add `zero/queries.ts` using at least one point query and one list query.
- [x] Add `/api/zero/mutate` route.
- [x] Add `/api/zero/query` route.
- [x] Optionally add `/api/mutators/$` for direct mutator invocation during debugging.
- [ ] Add `ZeroInit` client wiring.
- [ ] Add router context carrying `zero`.
- [x] Add one screen that fires a mutation.
- [ ] Add one screen that reads the changed data back with `useQuery`.
- [x] Add deterministic seed and reset mechanisms.

Minimum UI fixtures to build:

- [x] artist detail screen with `Add to cart` and `Remove from cart`
- [x] cart screen showing current cart rows
- [x] list/search screen for a non-trivial read path

## 7. Verification Ladder

This is the order to validate implementation. Do not jump straight to the browser.

### Layer 1: Fast Package Tests

- [x] `vp run test -r`
- [x] all shared contract tests stay green
- [x] v3 adapter behavior tests green
- [x] v4 adapter behavior tests green

### Layer 2: Postgres-Backed Integration Tests

- [x] Seed a local Postgres test database for v3 adapter tests.
- [x] `drizzle-kit migrate` applies the shared fixture migrations to a fresh Postgres database.
- [x] `drizzle-kit push` provisions the shared fixture schema on a fresh Postgres database.
- [x] Prove direct Drizzle write then adapter read for v3.
- [x] Prove adapter mutation then direct Drizzle read for v3.
- [x] Prove `handleMutateRequest` advances LMID and writes mutation results correctly for v3.
- [x] Prove duplicate replay keeps `lastMutationID` stable for `control`, `v3`, and `v4`.
- [x] Prove out-of-order requests fail without creating client protocol state for `control`, `v3`, and `v4`.
- [x] Prove sequential and batched alternating write patterns converge to the expected final cart state.
- [x] Prove parallel same-user adds converge to a single cart row while keeping per-client LMID state correct.
- [x] Guard shared fixture verification with a single lock so API verification and mutation stress do not stomp each other.
- [x] Prove `handleQueryRequest` returns expected transformed query output.

### Layer 3: App API Tests

- [x] Start the TanStack Start integration app locally.
- [x] Hit `/api/zero/query` directly and verify response shape.
- [x] Hit `/api/zero/mutate` directly and verify authoritative mutation flow.
- [x] Hit the simpler `/api/mutators/$` route if included.

### Layer 4: Browser Verification

- [x] Open the integration app in a browser.
- [x] Trigger add-to-cart from the artist screen.
- [x] Confirm cart screen reflects the mutation.
- [x] Trigger remove-from-cart.
- [x] Confirm the query result updates again.

Recommended browser tool:

- use Playwriter or `agent-browser` only after the integration app exists and the API routes are running
- current blocker: Playwriter extension was not connected during the latest verification pass

### Latest Verified Run: 2026-03-13

- [x] `curl http://localhost:3100/api/demo/state`
- [x] `curl -X POST http://localhost:3100/api/demo/reset`
- [x] `curl http://localhost:3100/api/mutators`
- [x] `curl -X POST http://localhost:3100/api/mutators/cart/add`
- [x] `curl -X POST http://localhost:3100/api/zero/query`
- [x] `curl -X POST http://localhost:3100/api/zero/mutate`
- [x] `psql ... zero_0."clients"` shows `lastMutationID = 1` for `cg1/c1`
- [ ] Browser automation pass against `http://localhost:3100/`

### Latest Verified Run: 2026-03-14

- [x] `pnpm --filter @effect-zero/v3 test`
- [x] `pnpm --filter @effect-zero/v4 test`
- [x] `vp run test -r`
- [x] `vp run build -r`
- [x] `vp check --fix`
- [x] `pnpm verify:api:package`
- [x] `pnpm verify:api`
- [x] `pnpm bench:api:quick`
- [x] `pnpm bench:api:web:quick`

### Latest Verified Run: 2026-03-15

- [x] `vp check --fix`
- [x] `vp run test -r`
- [x] `vp run build -r`
- [x] `pnpm verify:client-entrypoints`
- [x] `pnpm verify:api:package`
- [x] `pnpm verify:api`
- [x] `pnpm verify:mutation-stress:package`
- [x] `packages/effect-zero-v3/tests/server-mutators.test.ts` covers `runDefaultMutation()` double-call rollback
- [x] `packages/effect-zero-v4/tests/server-mutators.test.ts` covers `runDefaultMutation()` double-call rollback
- [x] `benchmarks/results/latest.json` updated from the live local Node harness on `http://127.0.0.1:3210/`
- [x] `benchmarks/results/web/latest.json` updated from the worker-facing route surface on `http://localhost:3100/`
- [x] Browser automation pass against `http://localhost:3100/` via `agent-browser`

## 8. Benchmark and Metrics Plan

The benchmark matrix is already scaffolded. The next work is executing it and persisting results.

Current scenario matrix already tracked:

- mutation cold single 1
- mutation warm single 1
- mutation warm serial 10
- mutation warm serial 100
- mutation warm parallel 10
- mutation warm parallel 100
- query cold single 1
- query warm single 1
- query warm serial 10
- query warm serial 100
- query warm parallel 10
- query warm parallel 100

Targets we need real measurements for:

- [x] `control-dbconnection`
- [x] `zero-mutation-layer-control`
- [x] `zero-query-transform`
- [x] `effect-v3-dbconnection`
- [x] `zero-mutation-layer-v3`
- [x] `zql-read-layer-v3`
- [x] `effect-v4-dbconnection`
- [x] `zero-mutation-layer-v4`
- [x] `zql-read-layer-v4`

Metrics to capture for every run:

- [ ] sample count
- [ ] total iterations
- [ ] min latency
- [ ] max latency
- [ ] average latency
- [ ] p50 latency
- [ ] p95 latency
- [ ] ops/sec
- [ ] git commit SHA
- [ ] package version under test
- [ ] Node version
- [ ] database connection mode
- [ ] fixture name

Recommended result artifacts:

- [x] `benchmarks/results/latest.json`
- [x] timestamped control-lane artifact under `benchmarks/results/`
- [x] package-lane benchmark artifact covering v3 and v4 targets
- [x] worker-facing reduced benchmark artifact under `benchmarks/results/web/`

- `benchmarks/results/*.json`
- `benchmarks/results/latest.json`
- optional summary renderer in a future docs-only page if needed

## 9. Definition Of Done

Use `/Users/am/Coding/2026/effect-zero/docs/ACCEPTANCE_CRITERIA.md`.

This tracker should record progress and next steps, not redefine acceptance separately.

## 10. Immediate Next Steps

- [x] Create the TanStack Start integration app.
- [x] Port the smallest useful ztunes fixture: cart add/remove plus cart query.
- [x] Implement v3 `DBConnection` first against Drizzle Effect Postgres on Effect v3.
- [ ] Port the same behavior tests to v4.
- [ ] Add a real benchmark runner after one package passes end-to-end.
