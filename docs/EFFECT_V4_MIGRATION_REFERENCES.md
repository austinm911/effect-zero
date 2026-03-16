# Effect v4 Migration References

As of March 13, 2026, the Effect v4 lane in this repo must be built against these pinned local references.

This file is the canonical starting point for any work in:

- `/Users/am/Coding/2026/effect-zero/packages/effect-zero-v4`

## Pinned Local Sources

- Effect v4 migration guide
  `/Users/am/Coding/2026/effect-zero/.context/effect-v4-beta/MIGRATION.md`
- Effect v4 focused migration docs
  `/Users/am/Coding/2026/effect-zero/.context/effect-v4-beta/migration/services.md`
  `/Users/am/Coding/2026/effect-zero/.context/effect-v4-beta/migration/runtime.md`
  `/Users/am/Coding/2026/effect-zero/.context/effect-v4-beta/migration/yieldable.md`
  `/Users/am/Coding/2026/effect-zero/.context/effect-v4-beta/migration/schema.md`
- Drizzle ORM pinned beta source
  `/Users/am/Coding/2026/effect-zero/.context/drizzle-orm-v1.0.0-beta.17`
- Drizzle Effect Postgres entrypoints
  `/Users/am/Coding/2026/effect-zero/.context/drizzle-orm-v1.0.0-beta.17/drizzle-orm/src/effect-postgres/index.ts`
  `/Users/am/Coding/2026/effect-zero/.context/drizzle-orm-v1.0.0-beta.17/drizzle-orm/src/effect-postgres/driver.ts`
  `/Users/am/Coding/2026/effect-zero/.context/drizzle-orm-v1.0.0-beta.17/drizzle-orm/src/effect-postgres/session.ts`
  `/Users/am/Coding/2026/effect-zero/.context/drizzle-orm-v1.0.0-beta.17/drizzle-orm/src/effect-postgres/migrator.ts`
- Drizzle lower-level Effect query machinery
  `/Users/am/Coding/2026/effect-zero/.context/drizzle-orm-v1.0.0-beta.17/drizzle-orm/src/pg-core/effect/session.ts`
  `/Users/am/Coding/2026/effect-zero/.context/drizzle-orm-v1.0.0-beta.17/drizzle-orm/src/pg-core/effect/query.ts`
  `/Users/am/Coding/2026/effect-zero/.context/drizzle-orm-v1.0.0-beta.17/drizzle-orm/src/pg-core/effect/raw.ts`

## Why These Files Matter

- `MIGRATION.md` is the authoritative v3 to v4 migration guide for Effect package layout and API movement.
- `services.md` matters because v4 changes service construction and lookup patterns.
- `runtime.md` matters because v4 removes the old `Runtime<R>` model and changes how runtime ownership should be represented.
- `yieldable.md` matters because some v3 subtyping assumptions no longer hold in v4.
- `schema.md` matters because schema imports and unstable-module boundaries can move under v4.
- Drizzle `effect-postgres/driver.ts` shows the actual v4-facing database construction path we need to mirror.
- Drizzle `effect-postgres/session.ts` shows the transaction, prepared query, and raw execution path that the Zero adapter needs for:
  - `tx.dbTransaction.query(...)`
  - `tx.dbTransaction.wrappedTransaction`
- Drizzle `pg-core/effect/*` files show the lower-level effect query builders and raw query behavior when the higher-level adapter path is not enough.

## Current Migration Constraints For This Repo

- Do not model the v4 adapter from the v3 package by string substitution.
- Do not assume v3 package versions map to v4 by keeping old `0.x` package versions.
- Use matching v4 beta versions across `effect` and `@effect/sql-*`.
- Treat unstable `effect/unstable/*` modules as unstable inputs if they become necessary.
- Keep the Zero adapter surface stable even if the Effect runtime construction changes internally.
- Keep these upstream Drizzle behaviors intact:
  - `tx.dbTransaction.query(...)` works for raw SQL
  - `tx.dbTransaction.wrappedTransaction` exposes native Drizzle query APIs

## Required Reading Order Before Editing `packages/effect-zero-v4`

1. `/Users/am/Coding/2026/effect-zero/docs/EFFECT_V4_MIGRATION_REFERENCES.md`
2. `/Users/am/Coding/2026/effect-zero/.context/effect-v4-beta/MIGRATION.md`
3. `/Users/am/Coding/2026/effect-zero/.context/effect-v4-beta/migration/runtime.md`
4. `/Users/am/Coding/2026/effect-zero/.context/effect-v4-beta/migration/services.md`
5. `/Users/am/Coding/2026/effect-zero/.context/drizzle-orm-v1.0.0-beta.17/drizzle-orm/src/effect-postgres/driver.ts`
6. `/Users/am/Coding/2026/effect-zero/.context/drizzle-orm-v1.0.0-beta.17/drizzle-orm/src/effect-postgres/session.ts`
7. `/Users/am/Coding/2026/effect-zero/.context/rocicorp-mono/packages/zero-server/src/adapters/drizzle.ts`
8. `/Users/am/Coding/2026/effect-zero/.context/rocicorp-mono/packages/zql/src/mutate/custom.ts`

## Source URLs

- [drizzle-orm `v1.0.0-beta.17`](https://github.com/drizzle-team/drizzle-orm/tree/v1.0.0-beta.17)
- [effect-smol `MIGRATION.md`](https://github.com/Effect-TS/effect-smol/blob/main/MIGRATION.md)
