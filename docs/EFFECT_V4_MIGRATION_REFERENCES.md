# Effect v4 Migration References

As of May 3, 2026, the Effect v4 lane in this repo must be built against these references.

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
- Drizzle ORM RC package
  `drizzle-orm@1.0.0-rc.4`
- Drizzle Effect Postgres entrypoints
  `drizzle-orm/effect-postgres`
  `drizzle-orm/effect-postgres/driver`
  `drizzle-orm/effect-postgres/session`
  `drizzle-orm/effect-postgres/migrator`
- Drizzle lower-level Effect query machinery
  `drizzle-orm/pg-core/effect/session`

## Why These Files Matter

- `MIGRATION.md` is the authoritative v3 to v4 migration guide for Effect package layout and API movement.
- `services.md` matters because v4 changes service construction and lookup patterns.
- `runtime.md` matters because v4 removes the old `Runtime<R>` model and changes how runtime ownership should be represented.
- `yieldable.md` matters because some v3 subtyping assumptions no longer hold in v4.
- `schema.md` matters because schema imports and unstable-module boundaries can move under v4.
- Drizzle `effect-postgres/driver` shows the actual v4-facing database construction path we need to mirror.
- Drizzle `effect-postgres/session` shows the transaction, prepared query, and raw execution path that the Zero adapter needs for:
  - `tx.dbTransaction.query(...)`
  - `tx.dbTransaction.wrappedTransaction`
- Drizzle `pg-core/effect/session` shows the lower-level prepared query behavior when the higher-level adapter path is not enough.

## Current Migration Constraints For This Repo

- Do not model the v4 adapter from the v3 package by string substitution.
- Do not assume v3 package versions map to v4 by keeping old `0.x` package versions.
- Use Drizzle `v1.0.0-rc.4` for the v4 Drizzle adapter.
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
5. `drizzle-orm@1.0.0-rc.4` `effect-postgres/driver`
6. `drizzle-orm@1.0.0-rc.4` `effect-postgres/session`
7. `/Users/am/Coding/2026/effect-zero/.context/rocicorp-mono/packages/zero-server/src/adapters/drizzle.ts`
8. `/Users/am/Coding/2026/effect-zero/.context/rocicorp-mono/packages/zql/src/mutate/custom.ts`

## Source URLs

- [drizzle-orm `v1.0.0-rc.4`](https://github.com/drizzle-team/drizzle-orm/releases/tag/v1.0.0-rc.4)
- [effect-smol `MIGRATION.md`](https://github.com/Effect-TS/effect-smol/blob/main/MIGRATION.md)
