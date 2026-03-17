# Examples

This folder has two different example surfaces.

- `examples/ztunes`
  Browser smoke app. Use this to exercise the real client UI and the three
  browser-visible targets:
  - `control`
  - `v3-drizzle`
  - `v4-drizzle`
- `examples/api`
  Runnable Node harness for the full runtime × adapter matrix. Use this for
  package verification, request-level testing, and adapter comparisons.

## Which One To Run

Use `examples/ztunes` when you care about:

- the browser UI
- Zero client behavior
- optimistic updates
- target switching in the app header

Use `examples/api` when you care about:

- adapter coverage beyond Drizzle
- request/response behavior
- fixture reset and state inspection
- package-level verification scripts

## Local Dev

Shared prerequisites from the workspace root:

```bash
pnpm dev:db
pnpm seed:ztunes
```

`pnpm seed:ztunes` is required on a clean database. The demo and verification
routes fail if the fixture catalog is empty.

## Process Matrix

| What you want                         | Required processes                            |
| ------------------------------------- | --------------------------------------------- |
| ztunes `control` only                 | `pnpm dev` + `pnpm dev:zero`                  |
| ztunes `v3-drizzle` / `v4-drizzle`    | `pnpm dev` + `pnpm dev:zero` + `pnpm dev:api` |
| direct harness work in `examples/api` | `pnpm dev:api`                                |

## One Process Per Terminal

Recommended split for readable logs:

Terminal 1:

```bash
pnpm dev
```

Terminal 2:

```bash
pnpm dev:zero
```

Optional Terminal 3:

```bash
pnpm dev:api
```

If you want everything in one terminal anyway, use:

```bash
pnpm dev:stack
```

That is convenient for quick bring-up, but it is worse for log inspection.

## URLs

- ztunes: `http://localhost:4310`
- example API harness: `http://localhost:4311`
- Zero Cache: `http://localhost:4848`

## Read Next

- `examples/ztunes/README.md`
- `examples/api/README.md`
