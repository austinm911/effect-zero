# effect-zero

Effect-backed server adapters for [Zero](https://zero.rocicorp.dev) mutators.

Use Effect services, workflows, and deferred post-commit effects inside Zero's
authoritative server mutation path without changing your browser-safe mutators.

## Packages

| Package                                        | Effect | Status |
| ---------------------------------------------- | ------ | ------ |
| [`@effect-zero/v3`](./packages/effect-zero-v3) | v3     | stable |
| [`@effect-zero/v4`](./packages/effect-zero-v4) | v4     | beta   |

Install one line only:

```bash
pnpm add @effect-zero/v3
# or
pnpm add @effect-zero/v4
```

Choose peer deps that match your adapter:

```bash
pnpm add @rocicorp/zero effect

# Drizzle lane
pnpm add drizzle-orm

# node-postgres lane
pnpm add pg

# postgres.js lane
pnpm add postgres
```

## What You Get

- `extendServerMutator(...)`
  Wrap a shared Zero mutator with server-only Effect logic.
- `createServerMutatorHandler(...)`
  Plug a mutator registry into `handleMutateRequest(...)`.
- `createRestMutatorHandler(...)`
  Run the same registry through ordinary REST endpoints.
- `server/adapters/postgresjs`
  Wrap `postgres.js`.
- `server/adapters/pg`
  Wrap `pg`.
- `server/adapters/drizzle`
  Wrap Effect Drizzle with either an owned connection or a caller-owned DB.

The shared client mutator stays unchanged. Only the server route and optional
server overrides move to effect-zero.

## Choose A Package

- Use [`@effect-zero/v3`](./packages/effect-zero-v3) if your app already uses
  Effect v3.
- Use [`@effect-zero/v4`](./packages/effect-zero-v4) if your app is on Effect
  v4 beta.
- For the v4 Drizzle adapter specifically, read the
  [`@effect-zero/v4` README](./packages/effect-zero-v4/README.md) for the
  compatibility notes around [drizzle-orm PR #5484](https://github.com/drizzle-team/drizzle-orm/pull/5484)
  and the optional install-time patch helper (`bun pm untrusted`, `pnpm approve-builds`, etc.).

The server adapter API is intentionally the same across both lines. The main
difference is the underlying Effect version and the service/layer style you
provide to `executeEffect(...)`.

The minimal example below uses `@effect-zero/v3` with the Drizzle lane because
that is the shortest end-to-end path. Swap the package import to `v4` if your
app is already on Effect v4.

## Choose An Adapter

| Adapter      | Use when                                                           | Owned mode                                                              | Caller-owned mode                                                             |
| ------------ | ------------------------------------------------------------------ | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `postgresjs` | you already use `postgres.js` or want the plainest Zero-style path | `zeroEffectPostgresJS(schema, connectionString)`                        | `zeroEffectPostgresJS(schema, sql)`                                           |
| `pg`         | you already use `pg` pools/clients                                 | `zeroEffectNodePg(schema, connectionString)`                            | `zeroEffectNodePg(schema, poolOrClient)`                                      |
| `drizzle`    | you want typed Drizzle access in server overrides                  | `createZeroDbProvider({ connectionString, drizzleSchema, zeroSchema })` | `createZeroDbProvider({ db, zeroSchema })` or `zeroEffectDrizzle(schema, db)` |

Ownership rule:

- If you pass a connection string, the adapter creates and owns the client.
- If you pass an existing DB/client, you own its lifecycle.

That means:

- owned mode: call `await provider.dispose()`
- caller-owned mode: `provider.dispose()` is a no-op and you dispose your own
  client/runtime yourself

## Minimal Shape

Shared mutator:

```ts
import { defineMutator } from "@rocicorp/zero";

export const add = defineMutator(argsSchema, async ({ tx, ctx, args }) => {
  await tx.mutate.cartItem.insert({
    userId: ctx.userId,
    albumId: args.albumId,
    addedAt: args.addedAt,
  });
});
```

Server override:

```ts
import { extendServerMutator } from "@effect-zero/v3/server";
import { Effect } from "effect";

export const addServer = extendServerMutator(add, ({ args, ctx, runDefaultMutation, defer }) =>
  Effect.gen(function* () {
    yield* runDefaultMutation();

    const cart = yield* CartWorkflow;
    yield* cart.recalculate(ctx.userId, args.albumId);
    defer(analytics.track("cart.added", { userId: ctx.userId }));
  }),
);
```

Mutate route:

```ts
import { handleMutateRequest } from "@rocicorp/zero/server";
import { createServerMutatorHandler } from "@effect-zero/v3/server";
import { createZeroDbProvider } from "@effect-zero/v3/server/adapters/drizzle";

const provider = await createZeroDbProvider({
  connectionString: process.env.DATABASE_URL!,
  drizzleSchema,
  zeroSchema: schema,
});

const handler = createServerMutatorHandler({
  mutators: serverMutators,
  getContext: () => ({ userId }),
  executeEffect: ({ effect }) => Effect.runPromise(effect),
});

return await handleMutateRequest(provider.zql, handler, request);
```

## Production Notes

### `runDefaultMutation()`

Use `runDefaultMutation()` only when you want to compose server-only work around
the shared browser-safe mutator.

- composed override: call `runDefaultMutation()`, then add Effect logic
- full replacement: do not call `runDefaultMutation()` at all

### Cloudflare Workers

Do not keep DB providers or TCP-backed clients in module scope on Workers.
Create them inside the request handler and dispose them before the response
returns.

```ts
export const ServerRoute = createServerFileRoute("/api/zero/mutate").methods({
  POST: async ({ request }) => {
    const provider = await createZeroDbProvider({
      connectionString: env.HYPERDRIVE.connectionString,
      drizzleSchema,
      zeroSchema: schema,
    });

    try {
      return json(await handleMutateRequest(provider.zql, handler, request));
    } finally {
      await provider.dispose();
    }
  },
});
```

### Drizzle Schema vs Zero Schema

- `drizzleSchema` configures the Drizzle database and typed relations
- `zeroSchema` configures Zero's `ZQLDatabase`

You need both for the Drizzle lane because Drizzle and Zero each need their own
schema representation.

## Read Next

- [`@effect-zero/v3` package docs](./packages/effect-zero-v3/README.md)
- [`@effect-zero/v4` package docs](./packages/effect-zero-v4/README.md)
- [examples overview](./examples/README.md)

## Maintainer Docs

For repo-local examples, verification commands, and service bring-up, use:

- [examples/README.md](./examples/README.md)
- [AGENTS.md](./AGENTS.md)

## Repo Cleanup

Use Desloppify as the repo-local cleanup queue after correctness is green:

```bash
uv tool install --upgrade "desloppify[full]"
pnpm desloppify:scan
pnpm desloppify:next
```

`pnpm desloppify:scan` bootstraps the known excludes for local state, generated output, verification artifacts, and read-only upstream clones before scanning. Desloppify state lives under `.desloppify/` and is intentionally ignored.

## License

MIT
