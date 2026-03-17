# Changelog

All notable changes to this repo are tracked here.

This repo publishes two packages from one source tree:

- `@effect-zero/v3`
- `@effect-zero/v4`

Entries are grouped by package so shared repo work can still be described in one place without
maintaining separate changelog files in each package directory.

## Unreleased

### Repo

- Wire up Vite+ CI, commit hooks, release helpers, and repo publishing docs.
- Add a release workflow for package-specific version bumps and publish commands.
- Add repo-local Desloppify setup and queue helpers.

### `@effect-zero/v3`

- Simplify manifest/test-utils scaffolding and remove identity wrapper helpers.
- Clarify `extendServerMutator(...)` request-scope guard messaging.

### `@effect-zero/v4`

- Simplify manifest/test-utils scaffolding and remove identity wrapper helpers.
- Clarify `extendServerMutator(...)` request-scope guard messaging.

### Examples and Harness

- Split benchmark-only protocol reads from the public demo protocol route.
- Keep public demo/direct routes pinned to the demo user instead of caller-selected identity.
- Clarify that `/api/zql/read` is a harness-only integration and benchmarking surface.
- Quiet expected Zero bootstrap `NOTICE` spam in the example API logs.
- Add current mutation-stress verification snapshots and scorecard artifact.

## `@effect-zero/v3` 0.1.0 - 2026-03-16

- First public release of the Effect v3 adapter line.
- Includes Drizzle, `pg`, and `postgres.js` server adapter support.
- Supports caller-owned and package-owned database/provider setup paths.
- Ships the shared server mutator helpers and request handlers used by the example harness.

## `@effect-zero/v4` 0.1.0-beta.0 - 2026-03-16

- First public beta release of the Effect v4 adapter line.
- Includes Drizzle, `pg`, and `postgres.js` server adapter support.
- Mirrors the upstream Drizzle Effect v4 compatibility work while the upstream beta stabilizes.
- Intended for experimental use until the Effect v4 and Drizzle integration story settles.
