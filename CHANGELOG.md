# Changelog

All notable changes to this repo are tracked here.

This repo publishes two packages from one source tree:

- `@awstin/effect-zero-v3`
- `@awstin/effect-zero-v4`

Entries are grouped by package so shared repo work can still be described in one place without
maintaining separate changelog files in each package directory.

## Unreleased

### Repo

- Wire up Vite+ CI, commit hooks, release helpers, and repo publishing docs.
- Add a release workflow for package-specific version bumps and publish commands.
- Add repo-local Desloppify setup and queue helpers.

### `@awstin/effect-zero-v3`

- Simplify manifest/test-utils scaffolding and remove identity wrapper helpers.
- Clarify `extendServerMutator(...)` request-scope guard messaging.
- Add a reusable mutation execution core with pluggable post-commit schedulers.
- Add typed server mutator helpers and shared push/error utilities.
- Keep Zero and Effect as peer dependencies and add install smoke checks.

### `@awstin/effect-zero-v4`

- Simplify manifest/test-utils scaffolding and remove identity wrapper helpers.
- Clarify `extendServerMutator(...)` request-scope guard messaging.
- Add a reusable mutation execution core with pluggable post-commit schedulers.
- Restore Drizzle query-builder Effect semantics from the follow-up v4 patch work.
- Keep runtime Drizzle patching inside the adapter and document the manual fallback helper.

### Examples and Harness

- Split benchmark-only protocol reads from the public demo protocol route.
- Keep public demo/direct routes pinned to the demo user instead of caller-selected identity.
- Clarify that `/api/zql/read` is a harness-only integration and benchmarking surface.
- Quiet expected Zero bootstrap `NOTICE` spam in the example API logs.
- Add current mutation-stress verification snapshots and scorecard artifact.
- Split `pnpm dev:db` from `pnpm db:push` and document the fresh-Postgres flow.

## `@awstin/effect-zero-v3` 0.3.0 - 2026-04-13

- Support `@rocicorp/zero` 1.1.1 and require Zero 1.x peers.
- Confirm the v3 Drizzle, `pg`, and `postgres.js` adapter matrix against Zero 1.1.1.

## `@awstin/effect-zero-v4` 0.2.0-beta.1 - 2026-04-13

- Support `@rocicorp/zero` 1.1.1 and require Zero 1.x peers.
- Confirm the v4 Drizzle, `pg`, and `postgres.js` adapter matrix against Zero 1.1.1.

## `@awstin/effect-zero-v3` 0.2.0 - 2026-03-21

- Add `createMutationExecutor(...)`, `createInlinePostCommitScheduler(...)`, and `createWaitUntilPostCommitScheduler(...)`.
- Add typed server mutator helpers including `defineEffectMutatorWithType(...)` and `extendServerMutatorWithType(...)`.
- Export shared timestamp conversion helpers and push/error guards from the root entrypoint.
- Move Zero and Effect to peer dependencies and add package install verification tooling.

## `@awstin/effect-zero-v4` 0.2.0-beta.0 - 2026-03-21

- Add `createMutationExecutor(...)`, `createInlinePostCommitScheduler(...)`, and `createWaitUntilPostCommitScheduler(...)`.
- Update the Drizzle Effect v4 patch layer to include the query-builder semantics follow-up from the v4 migration work.
- Keep runtime patching in the Drizzle adapter and ship a manual helper only for restricted environments.
- Move Zero and Effect to peer dependencies and add package install verification tooling.

## `@awstin/effect-zero-v3` 0.1.0 - 2026-03-16

- First public release of the Effect v3 adapter line.
- Includes Drizzle, `pg`, and `postgres.js` server adapter support.
- Supports caller-owned and package-owned database/provider setup paths.
- Ships the shared server mutator helpers and request handlers used by the example harness.

## `@awstin/effect-zero-v4` 0.1.0-beta.0 - 2026-03-16

- First public beta release of the Effect v4 adapter line.
- Includes Drizzle, `pg`, and `postgres.js` server adapter support.
- Mirrors the upstream Drizzle Effect v4 compatibility work while the upstream beta stabilizes.
- Intended for experimental use until the Effect v4 and Drizzle integration story settles.
