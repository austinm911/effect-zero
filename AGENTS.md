# Effect Zero

This repo publishes two Zero server adapter lines and keeps one shared client-safe mutator pattern.

- `packages/effect-zero-v3`
  Publishable Effect v3 adapter package.
- `packages/effect-zero-v4`
  Publishable Effect v4 adapter package.
- `packages/example-data`
  Shared schema (Drizzle + Zero) and browser-safe mutator definitions.
- `examples/ztunes`
  Canonical browser smoke app (ztunes-style). Exposes the browser-visible targets `control`, `v3-drizzle`, and `v4-drizzle`.
- `examples/api`
  Runnable Node harness for the full runtime × adapter matrix: `control`, `v3-drizzle`, `v3-pg`, `v3-postgresjs`, `v4-drizzle`, `v4-pg`, and `v4-postgresjs`.
- `infra/alchemy`
  Local infrastructure.

## Navigation Order

1. Read this file.
2. Read [README.md](/Users/am/Coding/2026/effect-zero/README.md).
3. Read [ACCEPTANCE_CRITERIA.md](/Users/am/Coding/2026/effect-zero/ACCEPTANCE_CRITERIA.md).
4. Read [DESIRED_MUTATOR_API.md](/Users/am/Coding/2026/effect-zero/DESIRED_MUTATOR_API.md).
5. Use [ZERO_SERVER_SOURCE_MAP.md](/Users/am/Coding/2026/effect-zero/ZERO_SERVER_SOURCE_MAP.md) when you need the upstream Zero file map.
6. For v4 work, read [EFFECT_V4_MIGRATION_REFERENCES.md](/Users/am/Coding/2026/effect-zero/EFFECT_V4_MIGRATION_REFERENCES.md) before editing code.

## Runtime

- `examples/ztunes` is the example app and browser verification surface.
- It runs the Promise control target locally and proxies the browser-visible Effect targets to `examples/api`.
- A header tab toggle switches the `effect-zero-target` cookie between `control`, `v3-drizzle`, and `v4-drizzle`.
- `examples/api` owns the full package verification matrix and all non-browser TCP-sharing behavior.

## `.context/` Rules

Everything under [`.context`](/Users/am/Coding/2026/effect-zero/.context/README.md) is read-only reference material.

- Do not edit those clones.
- Use them to inspect upstream Zero, Effect, Drizzle, and example app behavior.
- Treat the pinned refs as the ground truth for comparison work.

## Commands

```bash
pnpm install
vp config
pnpm dev:db
pnpm dev
pnpm dev:api
pnpm dev:stack
pnpm dev:zero
pnpm desloppify:scan
pnpm desloppify:queue
pnpm fmt:fix
pnpm check
vp run test -r
vp run build -r
pnpm verify:client-entrypoints
pnpm verify:api
pnpm verify:api:package
pnpm verify:mutation-stress
pnpm verify:mutation-stress:package
```

Run `vp config` once after cloning to point your local Git hooks path at the committed `.vite-hooks` directory.

`pnpm dev` starts only the ztunes app. For DB-backed checks, start `pnpm dev:db` and then run `pnpm dev:api`, `pnpm dev:zero`, or `pnpm dev:stack` as needed.

Use `pnpm desloppify:scan` to bootstrap repo-local excludes and run a full Desloppify scan. Use `pnpm desloppify:queue` to work the current queue.

## Common Pitfalls

- Do not mix Effect v3 and v4 dependencies in one publishable package.
- Do not import server DB code into browser-facing mutator modules.
- Do not maintain a second hand-written Zero schema for the fixture.
- Do not edit `.context` clones.
- Keep server-only imports inside route handlers in `examples/ztunes/app/routes/api/*`.
- Keep client mutators app-owned and browser-safe.
- Put the versioned choice on the server runtime, not in the client bundle.

## Review Checklist

- [ ] `pnpm install`
- [ ] `pnpm fmt:fix`
- [ ] `pnpm check`
- [ ] `vp run test -r`
- [ ] `vp run build -r`
- [ ] `pnpm verify:client-entrypoints`
