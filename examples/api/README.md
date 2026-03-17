# API Harness Example

`examples/api` is the runnable package harness for the full runtime × adapter
matrix.

## What It Covers

This harness exposes all runtime targets:

- `control`
- `v3-drizzle`
- `v3-pg`
- `v3-postgresjs`
- `v4-drizzle`
- `v4-pg`
- `v4-postgresjs`

Use it when you want to verify adapter behavior without going through the
browser app.

`control` appears here intentionally as the baseline comparison target for
direct harness verification, even though ztunes also has its own local
`control` path.

## Why It Exists

`examples/ztunes` is intentionally smaller. It only exposes the browser-visible
targets and focuses on UI behavior.

`examples/api` owns:

- the full runtime × adapter matrix
- direct fixture routes
- package verification endpoints
- request-level inspection
- non-browser TCP-sharing behavior

## Local Run

After the shared setup in [examples/README.md](/Users/am/Coding/2026/effect-zero/examples/README.md), start:

```bash
pnpm dev:api
```

The harness listens at:

```text
http://localhost:4311
```

This service is normally started on its own for harness verification. It is
also the backend that ztunes proxies to when you switch to `v3-drizzle` or
`v4-drizzle`.

## Main Endpoints

- `POST /api/target`
  Set the active target cookie
- `POST /api/demo/reset`
  Reset fixture state
- `GET /api/demo/state`
  Read fixture state
- `GET /api/demo/protocol-state`
  Read protocol and authoring state
- `POST /api/direct/cart/add`
  Promise Drizzle baseline
- `POST /api/direct/read`
  Promise Drizzle read baseline
- `POST /api/mutators/:scope/:name`
  REST mutator surface
- `POST /api/zero/mutate`
  Zero mutate surface
- `POST /api/zero/query`
  Zero query transform surface
- `POST /api/zql/read`
  Adapter-backed read surface

## Verification Commands

From the workspace root:

```bash
pnpm verify:api:package
pnpm verify:mutation-stress:package
```

Those commands target this harness directly.
