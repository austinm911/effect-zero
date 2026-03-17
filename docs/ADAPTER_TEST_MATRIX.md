# Adapter Test Matrix

As of March 13, 2026, this repo has three distinct database-integration lanes.

They are intentionally not the same thing.

## Lane 1: Promise Control

Purpose:

- validate the local TanStack Start fixture
- validate the local Alchemy + Postgres stack
- validate the Zero HTTP surfaces and demo mutation/query loop

Implementation:

- direct `postgres` client
- Zero's built-in `zeroPostgresJS(schema, postgres(...))` adapter

Scope:

- `apps/web`
- local API smoke checks
- browser verification once Playwriter is connected
- worker-facing API verification via `pnpm verify:api`

This lane is a control, not the publishable package target.

The control exists so we can answer:

- does the fixture work at all?
- do the query and mutator semantics match Zero's expected behavior?
- what is the baseline overhead of the normal Promise-based path?

## Lane 2: Effect v3 Target

Purpose:

- build the publishable `@awstin/effect-zero-v3` package
- test a real Zero `DBConnection` backed by Drizzle's Effect Postgres integration

Implementation requirement:

- use Drizzle's `drizzle-orm/effect-postgres` integration
- use Effect v3
- do not use Zero's `zeroPostgresJS` adapter for the package implementation

Current state:

- `packages/effect-zero-v3/src/index.ts` contains the working adapter implementation.
- `packages/effect-zero-v3/tests/dbconnection.test.ts` proves:
  - Zero ZQL reads against the shared fixture schema
  - raw SQL through `tx.dbTransaction.query(...)`
  - native Drizzle query access through `tx.dbTransaction.wrappedTransaction`
  - request-level `handleMutateRequest(...)` behavior through the v3 provider
  - request-level `handleQueryRequest(...)` behavior for the shared artist query fixture

Primary source:

- [Drizzle <> Effect Postgres](https://orm.drizzle.team/docs/connect-effect-postgres)

Expected comparison points:

- direct Drizzle baseline
- Promise control via `zeroPostgresJS`
- Effect v3 custom `DBConnection`
- Effect v3 Zero mutation layer
- Effect v3 Zero query layer

## Lane 3: Effect v4 Target

Purpose:

- build the publishable `@awstin/effect-zero-v4` package
- test a real Zero `DBConnection` backed by the Effect v4 Drizzle work

Implementation requirement:

- use the pinned Drizzle beta source at `v1.0.0-beta.17`
- use the pinned Effect v4 migration docs from `effect-smol`
- do not use Zero's `zeroPostgresJS` adapter for the package implementation

Primary source:

- [drizzle-orm `v1.0.0-beta.17`](https://github.com/drizzle-team/drizzle-orm/tree/v1.0.0-beta.17)
- [effect-smol `MIGRATION.md`](https://github.com/Effect-TS/effect-smol/blob/main/MIGRATION.md)
- [EFFECT_V4_MIGRATION_REFERENCES.md](/Users/am/Coding/2026/effect-zero/docs/EFFECT_V4_MIGRATION_REFERENCES.md)

Important note:

- this lane is still upstream-dependent and should be treated as experimental while the Effect v4 and Drizzle beta surfaces continue moving
- `packages/effect-zero-v4/src/index.ts` now contains the working adapter implementation.
- `packages/effect-zero-v4/tests/dbconnection.test.ts` proves:
  - Zero ZQL reads against the shared fixture schema
  - raw SQL through `tx.dbTransaction.query(...)`
  - native Drizzle query access through `tx.dbTransaction.wrappedTransaction`
  - request-level `handleMutateRequest(...)` behavior through the v4 provider
  - request-level `handleQueryRequest(...)` behavior for the shared artist query fixture
- the repo currently depends on a local compatibility rewrite in `tools/fix-drizzle-v4-beta.mjs` to bridge the pinned Drizzle beta to the current Effect v4 beta surface

## Repository Rules

- `apps/package-api` is the Node-only local harness for exercising the v3 and v4 TCP adapters.
- `apps/web` remains the worker-safe request path and proxies non-control lanes into `apps/package-api` only for local verification.
- `apps/web` may keep using `zeroPostgresJS` because it is the Promise control lane.
- `packages/effect-zero-v3` must not implement its adapter by calling `zeroPostgresJS`.
- `packages/effect-zero-v4` must not implement its adapter by calling `zeroPostgresJS`.
- `packages/effect-zero-v3` and `packages/effect-zero-v4` must preserve the upstream Drizzle adapter surface:
  - `tx.dbTransaction.query(...)` works for raw SQL
  - `tx.dbTransaction.wrappedTransaction` exposes native Drizzle query APIs
- package tests for v3 and v4 must prove behavior through Drizzle + Effect-backed transactions.
- benchmarks must report the Promise control lane separately from the Effect v3 and Effect v4 lanes.
- all three lanes must consume the same fixture schema derived from `drizzle-zero`.
- the full benchmark matrix runs against `apps/package-api`
- the worker-facing benchmark uses a reduced single-and-serial scenario set because the control lane is intentionally request-scoped and should not default to parallel TCP pressure tests
- the benchmark runner holds a shared lock so package and web benchmark commands cannot run concurrently against the same local fixture database

## Required Benchmark Labels

- `drizzle-direct`
  Direct Drizzle baseline without Zero adapter wrapping.
- `control-dbconnection`
  Promise control `DBConnection` path using Zero's built-in postgres adapter.
- `zero-mutation-layer-control`
  Promise control Zero mutation path using Zero's built-in postgres adapter.
- `zero-query-transform`
  Shared `handleQueryRequest(...)` transform baseline. This does not execute through an adapter-backed database lane.
- `effect-v3-dbconnection`
  Custom Zero `DBConnection` using Drizzle Effect Postgres on Effect v3.
- `zero-mutation-layer-v3`
  Zero mutation path on top of the Effect v3 adapter.
- `zql-read-layer-v3`
  Adapter-backed `zql.run(...)` read path on top of the Effect v3 adapter.
- `effect-v4-dbconnection`
  Custom Zero `DBConnection` using the Drizzle Effect v4 branch/PR.
- `zero-mutation-layer-v4`
  Zero mutation path on top of the Effect v4 adapter.
- `zql-read-layer-v4`
  Adapter-backed `zql.run(...)` read path on top of the Effect v4 adapter.
