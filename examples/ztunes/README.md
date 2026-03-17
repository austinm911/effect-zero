# ztunes Example

`examples/ztunes` is the browser smoke app for this repo.

Its job is to prove that the real client app works against the browser-visible
targets without exposing the full adapter matrix in the UI.

## What It Covers

The header target tabs switch between:

- `control`
  Promise control path handled inside ztunes
- `v3-drizzle`
  Proxied to `examples/api`
- `v4-drizzle`
  Proxied to `examples/api`

The `pg` and `postgresjs` adapter targets do not appear in this app. They are
owned by `examples/api`.

## Why This App Exists

Use ztunes when you want to check:

- browser rendering
- client queries
- cart mutations
- target switching
- Zero Cache integration
- same-origin browser behavior

Do not use ztunes as the main adapter comparison harness. That belongs in
`examples/api`.

## Local Run

After the shared setup in [examples/README.md](/Users/am/Coding/2026/effect-zero/examples/README.md), run:

```bash
pnpm dev
pnpm dev:zero
```

`dev:zero` is part of the normal ztunes path. Without Zero Cache, the app boots
but the real Zero query and mutation flow is not meaningfully exercised.

If you want to use the `v3-drizzle` or `v4-drizzle` tabs, also start:

```bash
pnpm dev:api
```

Open:

```text
http://localhost:4310
```

## Practical Rule

- `control` only: `dev` + `dev:zero`
- Effect tabs: `dev` + `dev:zero` + `dev:api`

## One-Terminal Mode

If you only want a quick full bring-up:

```bash
pnpm dev:stack
```

That starts api, web, and zero together. It is useful for smoke checks, but it
mixes logs across service boundaries.

## Related Files

- app UI: `examples/ztunes/app`
- browser automation prompts: `examples/ztunes/testing`
- local app definition: `examples/ztunes/alchemy.run.ts`
