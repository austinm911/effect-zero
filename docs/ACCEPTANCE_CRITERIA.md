# Acceptance Criteria

This is the canonical implementation/spec file for this repo.

Use this file to answer:

- what must be true for v3 to be done
- what must be true for v4 to be done
- what shared constraints apply to both lines
- what tests and benchmark evidence are required before publish

Supporting docs still matter, but they are subordinate:

- `/Users/am/Coding/2026/effect-zero/docs/IMPLEMENTATION_TRACKER.md`
  Progress and next steps.
- `/Users/am/Coding/2026/effect-zero/docs/ADAPTER_TEST_MATRIX.md`
  Lane split and benchmark labels.
- `/Users/am/Coding/2026/effect-zero/docs/ZERO_SERVER_SOURCE_MAP.md`
  File-level implementation map.
- `/Users/am/Coding/2026/effect-zero/docs/EFFECT_V4_MIGRATION_REFERENCES.md`
  Pinned v4 migration inputs.
- `/Users/am/Coding/2026/effect-zero/docs/EFFECT_ZERO_COMPARISON.md`
  Comparison with `realms-labs/effect-zero` and the mutator API direction.
- `/Users/am/Coding/2026/effect-zero/docs/MUTATOR_API_OPTIONS.md`
  Valterra comparison, recommended mutator API direction, and transaction parity matrix.
- `/Users/am/Coding/2026/effect-zero/docs/DESIRED_MUTATOR_API.md`
  Canonical target mutator API, file layout, and v3/v4 service patterns.

## Shared Acceptance Criteria

- One shared Postgres fixture schema exists in:
  `/Users/am/Coding/2026/effect-zero/packages/example-data/src/db/schema.ts`
- One shared Zero schema is generated from that Drizzle schema via `drizzle-zero` in:
  `/Users/am/Coding/2026/effect-zero/packages/example-data/src/zero/schema.ts`
- The shared fixture schema is used consistently by:
  - `apps/web`
  - `packages/effect-zero-v3`
  - `packages/effect-zero-v4`
- Zero internal tables such as `zero_0.clients` and `zero_0.mutations` are not modeled in the shared fixture schema package.
- `apps/web` is the Promise-control lane only.
- `apps/web` is the worker-safe request path and must not rely on shared TCP connections across worker requests.
- `apps/package-api` is allowed to share Node TCP resources because it is a local-only verification and benchmark harness, not the Cloudflare deployment model.
- `packages/effect-zero-v3` and `packages/effect-zero-v4` must not implement their adapters by calling `zeroPostgresJS`.
- Both publishable adapter lines must preserve the upstream Drizzle adapter surface:
  - `tx.dbTransaction.query(...)` works for raw SQL
  - `tx.dbTransaction.wrappedTransaction` exposes native Drizzle query APIs
- The control lane and both package lanes must remain testable against the same fixture semantics.
- The publishable adapter lines are not done with only `DBConnection` support.
- Both publishable adapter lines must also expose a typed server mutator authoring API that can run backend logic through the lane-specific adapter.
- The server mutator authoring API must support Effect-style service injection for its lane.
- The default server mutator authoring model must execute the whole logical mutator body inside exactly one adapter-backed transaction.
- The default server mutator authoring model must not require users to manually enter the transaction body multiple times.
- The mutator API must expose explicit `shared`, `client`, and `server` boundaries so browser code never imports server-only DB clients or runtimes.
- The mutator API must not require authors to duplicate every logical mutator into full client and server definitions when only one side is needed.

## Mutator API Acceptance Criteria

- [x] `packages/effect-zero-v3` exposes a typed server mutator helper surface in addition to `createDbConnection()` and `createZeroDbProvider()`.
- [x] `packages/effect-zero-v4` exposes a typed server mutator helper surface in addition to `createDbConnection()` and `createZeroDbProvider()`.
- [x] The mutator helper surface supports validator/schema-driven argument decoding.
- [x] The mutator helper surface supports lane-specific Effect service injection.
- [x] The mutator helper surface runs backend logic through exactly one adapter-backed transaction by default.
- [x] The mutator helper surface composes with `handleMutateRequest(...)` for both v3 and v4.
- [x] The package surface is split into browser-safe `shared` and `client` exports plus a server-only `server` export.
- [ ] The default authoring path supports server-only custom mutators with a shared contract and typed client caller, without forcing a client implementation body.
- [x] There are request-level tests proving service-backed custom mutators work in both v3 and v4.
- [ ] There are transaction-parity tests proving the same business operation behaves correctly across:
  - plain Drizzle Promise
  - Drizzle Effect v3
  - Drizzle Effect v4
  - Zero Promise control
  - Zero Effect v3
  - Zero Effect v4
- [ ] There are request-level tests covering:
  - success path
  - validation failure
  - failure before commit
  - failure inside the transaction
  - batched mutations
  - out-of-order mutation handling
- [x] There is a repeatable mutation stress verifier covering:
  - sequential alternating mutations at `10` and `100`
  - batched alternating mutations at `10` and `100`
  - duplicate replay
  - out-of-order mutation handling
  - parallel same-user writes from `10` clients
- [x] There is an explicit policy test or invariant preventing accidental multi-transaction mutator authoring in the default path.

## v3 Acceptance Criteria

- [x] `packages/effect-zero-v3` exports a working Zero-compatible `createDbConnection()`.
- [x] `packages/effect-zero-v3` exports a working Zero-compatible provider bridge.
- [x] The v3 adapter uses Drizzle Effect Postgres rather than Zero's built-in postgres adapter.
- [x] The v3 adapter supports Zero ZQL reads.
- [x] The v3 adapter supports raw SQL via `tx.dbTransaction.query(...)`.
- [x] The v3 adapter exposes native Drizzle relational queries through `tx.dbTransaction.wrappedTransaction`.
- [x] The v3 lane has request-level `handleMutateRequest(...)` coverage.
- [x] The v3 lane has request-level `handleQueryRequest(...)` coverage as package-level tests.
- [x] The v3 lane proves direct Drizzle writes interoperate with adapter reads and writes.
- [x] The integration app can exercise the v3 package end to end through the local Node harness plus the worker-facing web proxy path.
- [x] Benchmark results exist for:
  - `effect-v3-dbconnection`
  - `zero-mutation-layer-v3`
  - `zql-read-layer-v3`
- [ ] Package surface is ready for publish.

## v4 Acceptance Criteria

- [x] `packages/effect-zero-v4` exports a working Zero-compatible `createDbConnection()`.
- [x] `packages/effect-zero-v4` exports a working Zero-compatible provider bridge.
- [x] The v4 adapter uses the pinned Drizzle beta Effect Postgres path rather than Zero's built-in postgres adapter.
- [x] The v4 implementation work references:
  - `/Users/am/Coding/2026/effect-zero/docs/EFFECT_V4_MIGRATION_REFERENCES.md`
  - `/Users/am/Coding/2026/effect-zero/.context/effect-v4-beta/MIGRATION.md`
  - `/Users/am/Coding/2026/effect-zero/.context/drizzle-orm-v1.0.0-beta.17/drizzle-orm/src/effect-postgres/driver.ts`
  - `/Users/am/Coding/2026/effect-zero/.context/drizzle-orm-v1.0.0-beta.17/drizzle-orm/src/effect-postgres/session.ts`
- [x] The v4 adapter supports Zero ZQL reads.
- [x] The v4 adapter supports raw SQL via `tx.dbTransaction.query(...)`.
- [x] The v4 adapter exposes native Drizzle relational queries through `tx.dbTransaction.wrappedTransaction`.
- [x] The v4 lane has request-level `handleMutateRequest(...)` coverage.
- [x] The v4 lane has request-level `handleQueryRequest(...)` coverage.
- [x] The v4 lane proves direct Drizzle writes interoperate with adapter reads and writes.
- [x] The integration app can exercise the v4 package end to end through the local Node harness plus the worker-facing web proxy path.
- [x] Benchmark results exist for:
  - `effect-v4-dbconnection`
  - `zero-mutation-layer-v4`
  - `zql-read-layer-v4`
- [ ] Package surface is ready for publish.

## Control-Lane Acceptance Criteria

- [x] `apps/web` boots under the Alchemy-managed local stack.
- [x] The control lane can seed and reset fixture state deterministically.
- [x] Fixture bootstrap/reset is serialized so concurrent first requests do not race.
- [x] `/api/zero/mutate` works locally.
- [x] `/api/zero/query` works locally.
- [x] `/api/mutators/$` works locally.
- [x] Browser verification is rerun against the local app.

## Actual API Verification

These are the concrete API checks that should be used to prove the app path works, not just the package internals.

- Use the shared request fixtures in:
  `/Users/am/Coding/2026/effect-zero/packages/test-utils/src/api-fixtures.ts`
- Primary verification commands:
  - `pnpm verify:api`
  - `pnpm verify:api:package`
  - `pnpm verify:mutation-stress:package`
- Start by resetting the fixture state through:
  - `POST /api/demo/reset`
- Prove the direct mutator path works through:
  - `POST /api/mutators/cart/add`
  - `POST /api/mutators/cart/remove`
- Prove the Zero mutation path works through:
  - `POST /api/zero/mutate`
  - verify the mutation result payload
  - verify LMID persistence in `zero_0.clients`
- Prove the Zero query path works through:
  - `POST /api/zero/query` with `getArtist`
  - `POST /api/zero/query` with `getCartItems`
  - `POST /api/zero/query` with `listArtists`
- Prove the adapter-backed query execution path works through:
  - `POST /api/zql/read` with `getArtist`
  - `POST /api/zql/read` with `getCartItems`
  - `POST /api/zql/read` with `listArtists`
- Prove the read side reflects the write side by checking:
  - `GET /api/demo/state`
  - or a follow-up Zero query after a write
- Do not run the verifier concurrently with the benchmark runner. They mutate the same fixture state.
- `tools/verify-api-targets.mjs` and `tools/verify-mutation-stress.mjs` now share the same fixture lock.
  - They must also run sequentially with each other.

## API Performance Harness

- API perf runs should reuse the shared workload fixtures from:
  `/Users/am/Coding/2026/effect-zero/packages/test-utils/src/api-fixtures.ts`
- Full adapter comparison runs execute against the local Node harness in `apps/package-api`:
  - `pnpm bench:api`
  - `pnpm bench:api:quick`
  - `pnpm bench:api -- --samples 3`
  - `pnpm bench:api -- --fixture zero-query-get-artist`
  - `pnpm bench:api -- --scenario query.warm.parallel.10`
- Worker-facing route benchmarks execute against `apps/web` with a reduced scenario set:
  - `pnpm bench:api:web`
  - `pnpm bench:api:web:quick`
- Measure at least:
  - direct Drizzle add and read on the Node harness
  - direct mutator add
  - Zero mutate add
  - adapter-backed `zql.run(...)` read
  - Zero query transform
- Full Node-harness matrix:
  - cold single 1
  - warm single 1
  - warm serial 10
  - warm serial 100
  - warm parallel 10
  - warm parallel 100
- Reduced worker-facing matrix:
  - cold single 1
  - warm single 1
  - warm serial 10
- Reason for the reduced worker-facing matrix:
  - the Promise-control lane opens request-scoped Postgres clients, so the local Cloudflare-style path should not use parallel TCP pressure tests as the default benchmark target
- The benchmark runner enforces a lock so package and web benchmark commands cannot run concurrently against the shared fixture database.
- Verified artifacts:
  - `/Users/am/Coding/2026/effect-zero/benchmarks/results/latest.json`
  - `/Users/am/Coding/2026/effect-zero/benchmarks/results/web/latest.json`

## Required Package-Level Tests

These are required for both publishable adapter lines.

- Adapter behavior tests modeled after upstream `adapters.pg.test.ts`
- Raw SQL bridge tests
- Wrapped native Drizzle transaction access tests
- Request-level `handleMutateRequest(...)` tests
- Request-level `handleQueryRequest(...)` tests
- Direct Drizzle write vs adapter read/write interop tests
- Service-backed mutator authoring tests
- Transaction-parity tests from `MUTATOR_API_OPTIONS.md`

## Required Benchmark Evidence

Every measured target must report:

- sample count
- total iterations
- min latency
- max latency
- average latency
- p50 latency
- p95 latency
- ops/sec
- git commit SHA
- package version under test
- Node version
- database connection mode
- fixture name

Required result artifacts:

- `benchmarks/results/*.json`
- `benchmarks/results/latest.json`
- `benchmarks/results/web/*.json`
- `benchmarks/results/web/latest.json`

## Publish Gate

Neither package line is publishable until all of these are true for that line:

- package-level tests are green
- workspace verification is green
- benchmark artifacts exist
- acceptance criteria in this file are checked off
- the adapter surface matches the upstream Zero/Drizzle contract
