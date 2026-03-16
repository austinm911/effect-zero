# effect-zero

Effect adapters for [Zero](https://zero.rocicorp.dev) server mutators and
REST-style mutator APIs.

Use [Effect](https://effect.website) services, workflows, and deferred post-commit
side effects inside Zero's authoritative server mutation path, while keeping your
client mutators unchanged and optionally exposing the same mutator registry over a
traditional REST surface.

| Package                                        | Effect      | Status                                                                                                |
| ---------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------- |
| [`@effect-zero/v3`](./packages/effect-zero-v3) | v3 (stable) | [![npm](https://img.shields.io/npm/v/@effect-zero/v3)](https://www.npmjs.com/package/@effect-zero/v3) |
| [`@effect-zero/v4`](./packages/effect-zero-v4) | v4 (beta)   | [![npm](https://img.shields.io/npm/v/@effect-zero/v4)](https://www.npmjs.com/package/@effect-zero/v4) |

## What This Does

In a standard Zero app (like [ztunes](https://github.com/rocicorp/ztunes)),
server mutations look like this:

```ts
handleMutateRequest(
  dbProvider,
  async (transact) =>
    transact(async (tx, name, args) => {
      const mutator = mustGetMutator(mutators, name);
      await mutator.fn({ tx, ctx, args });
    }),
  request,
);
```

With effect-zero, you can extend individual mutators with Effect on the server
while the rest keep working as plain Zero:

```ts
// Server override — only for mutators that need it
const addServer = extendServerMutator(add, ({ args, ctx, runDefaultMutation, defer }) =>
  Effect.gen(function* () {
    yield* runDefaultMutation(); // run the shared mutator
    const cart = yield* CartWorkflow; // use Effect services
    yield* cart.recalculate(ctx.userId, args.albumId);
    defer(analytics.track("cart.added", { userId: ctx.userId })); // post-commit
  }),
);

// Plug into handleMutateRequest — same Zero function
handleMutateRequest(provider.zql, handler, request);
```

**Client code does not change.** The adapter only touches the server route.

If you also want the optional REST pattern from [Zero REST docs](https://zero.rocicorp.dev/docs/rest),
the same registry can be mounted for routes like `POST /api/mutators/cart/add`:

```ts
import { createRestMutatorHandler } from "@effect-zero/v3/server";

const restHandler = createRestMutatorHandler({
  mutators: serverMutators,
  getContext: () => ({ userId: session.user.id }),
});

await restHandler({
  db: provider.zql,
  mutation: {
    name: "cart.add",
    args: await request.json(),
  },
});
```

## Install

```bash
# Pick one:
pnpm add @effect-zero/v3   # Effect 3.x
pnpm add @effect-zero/v4   # Effect 4.x (beta)
```

Peer dependencies:

```bash
pnpm add @rocicorp/zero effect drizzle-orm
```

## Quick Start

> Full walkthrough with file layout, patterns, and migration steps:
> **[packages/effect-zero-v3/README.md](./packages/effect-zero-v3/README.md)** or
> **[packages/effect-zero-v4/README.md](./packages/effect-zero-v4/README.md)**

### 1. Define shared mutators (unchanged from plain Zero)

```ts
// zero/mutators.ts — browser-safe, no Effect dependency
import { defineMutator, defineMutators } from "@rocicorp/zero";
import { z } from "zod";

export const add = defineMutator(
  z.object({ albumId: z.string(), addedAt: z.number() }),
  async ({ tx, ctx, args }) => {
    if (!ctx) throw new Error("Not authenticated");
    await tx.mutate.cartItem.insert({
      userId: ctx.userId,
      albumId: args.albumId,
      addedAt: tx.location === "client" ? args.addedAt : Date.now(),
    });
  },
);

export const mutators = defineMutators({ cart: { add } });
```

### 2. Add a server override with Effect

```ts
// zero/mutators.server.ts — server-only
import { extendServerMutator } from "@effect-zero/v3/server";
import { defineMutators } from "@rocicorp/zero";
import { Effect } from "effect";
import { mutators, add } from "./mutators";

const serverMutators = defineMutators(mutators, {
  cart: {
    add: extendServerMutator(add, ({ args, ctx, runDefaultMutation, defer }) =>
      Effect.gen(function* () {
        yield* runDefaultMutation();
        // ... Effect services, workflows, post-commit effects
      }),
    ),
  },
});
```

### 3. Wire into your mutate route

This mirrors the [ztunes](https://github.com/rocicorp/ztunes) pattern with
[better-auth](https://www.better-auth.com) for session handling:

```ts
// app/routes/api/zero/mutate.ts
import { json } from "@tanstack/react-start";
import { createServerFileRoute } from "@tanstack/react-start/server";
import { handleMutateRequest } from "@rocicorp/zero/server";
import { createServerMutatorHandler } from "@effect-zero/v3/server";
import { createZeroDbProvider } from "@effect-zero/v3/server/adapters/drizzle";
import { auth } from "auth/auth";
import { serverMutators } from "zero/mutators.server";
import { schema } from "zero/schema";
import * as drizzleSchema from "drizzle/schema";

const provider = await createZeroDbProvider({
  connectionString: process.env.DATABASE_URL!,
  drizzleSchema,
  zeroSchema: schema,
});

export const ServerRoute = createServerFileRoute("/api/zero/mutate").methods({
  POST: async ({ request }) => {
    const session = await auth.api.getSession({ headers: request.headers });

    if (!session) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    const handler = createServerMutatorHandler({
      mutators: serverMutators,
      getContext: () => ({ userId: session.user.id }),
    });

    return json(await handleMutateRequest(provider.zql, handler, request));
  },
});
```

## API

Both packages export the same API shape from three entrypoint groups:

### `/server` (Node.js only)

| Export                                | Description                                                                                                                       |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `createRestMutatorHandler(opts)`      | Runs ordinary REST-style mutator calls like `POST /api/mutators/cart/add` through the same request-scoped override machinery.     |
| `createServerMutatorHandler(opts)`    | Dispatches mutations through your mutator registry with Effect execution and deferred post-commit effects.                        |
| `extendServerMutator(base, override)` | Wraps a `defineMutator` with an Effect server override. Override receives `args`, `ctx`, `tx`, `runDefaultMutation()`, `defer()`. |

### `/server/adapters/*` (Node.js only)

| Export path                                 | Description                                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `.../server/adapters/postgresjs`            | `zeroEffectPostgresJS(schema, sql)` for `postgres.js` callers.                             |
| `.../server/adapters/pg`                    | `zeroEffectNodePg(schema, pool)` for `pg` callers.                                          |
| `.../server/adapters/drizzle`               | `zeroEffectDrizzle(schema, db)`, `createZeroDbProvider(...)`, and `createDbConnection(...)` for Drizzle callers. |

### `/client` (browser-safe)

Re-exports from `@rocicorp/zero` for convenience: `defineMutator`, `defineMutators`,
`mustGetMutator`, etc. No Effect dependency.

## Key Concepts

### `extendServerMutator`

Wraps a base `defineMutator` with a server-only override:

```ts
extendServerMutator(baseMutator, ({ args, ctx, tx, runDefaultMutation, defer }) => {
  // Return void, Promise<void>, or Effect<void>
});
```

| Parameter              | Description                                                               |
| ---------------------- | ------------------------------------------------------------------------- |
| `args`                 | Validated mutator args (typed from base mutator's Zod schema)             |
| `ctx`                  | App context from `getContext` (userId, etc.)                              |
| `tx`                   | Zero `ServerTransaction` — includes `tx.dbTransaction` for raw SQL        |
| `runDefaultMutation()` | Runs the base mutator once in the server transaction. Optional. Max once. |
| `defer(effect)`        | Registers an Effect to run after the DB transaction commits               |

### `createServerMutatorHandler`

Creates a handler function compatible with `handleMutateRequest`:

```ts
createServerMutatorHandler({
  mutators: serverMutators,                    // from defineMutators(base, overrides)
  getContext: (mutation) => ({ userId: "..." }),  // resolve auth context per mutation
  executeEffect: ({ effect }) => ...,          // optional: provide Effect layers
});
```

### `createZeroDbProvider`

Replaces `zeroPostgresJS` with an Effect-managed connection pool backed by
[`drizzle-orm/effect-postgres`](https://orm.drizzle.team/docs/connect-effect-postgres):

```ts
import { createZeroDbProvider } from "@effect-zero/v3/server/adapters/drizzle";

const provider = await createZeroDbProvider({
  connectionString: "postgres://...",
  drizzleSchema, // Drizzle table/relation definitions
  zeroSchema: schema, // Zero schema (from drizzle-zero)
  pgClientConfig: {
    // optional @effect/sql-pg pool config
    maxConnections: 64,
  },
});

provider.zql; // → ZQLDatabase (pass to handleMutateRequest)
provider.connection; // → EffectDbConnection (Drizzle-over-Effect)
provider.dispose(); // → shuts down the pool
```

> On Cloudflare Workers, do not cache a DB provider or client in module scope.
> Create the adapter inside the request handler and dispose it before returning.
> Cloudflare's TCP socket API forbids sharing sockets across requests, and Hyperdrive
> is designed for fast per-request client construction.

> **Why both `drizzleSchema` and `zeroSchema`?** They serve different layers.
> `drizzleSchema` (your Drizzle table definitions) configures the Effect-managed
> Drizzle connection — it needs the tables and relations to build typed queries
> and wire up `@effect/sql-pg`. `zeroSchema` (typically generated by
> [`drizzle-zero`](https://github.com/nicholascelestin/drizzle-zero) from your
> Drizzle schema) is what Zero's `ZQLDatabase` needs to execute ZQL queries and
> validate mutations. Under the hood, `createZeroDbProvider` creates a
> `ManagedRuntime` with `PgClient.layer`, builds a Drizzle instance via
> `drizzle-orm/effect-postgres`, then wraps it in Zero's `ZQLDatabase` with your
> Zero schema. The plain Zero equivalent `zeroPostgresJS(schema, sql)` only takes
> the Zero schema because it uses raw `postgres.js` directly — no Drizzle layer.

## Repo Structure

```
packages/
  effect-zero-v3/     # Publishable — Effect v3 adapter
  effect-zero-v4/     # Publishable — Effect v4 adapter
  example-data/       # Shared Drizzle schema, Zero schema, and browser-safe mutators
examples/
  ztunes/             # TanStack Start browser smoke app for control, v3-drizzle, and v4-drizzle
  api/                # Runnable Hono/Node harness for the full runtime × adapter matrix
infra/
  alchemy/            # Local Postgres managed by Alchemy
```

## Local Development

```bash
pnpm install
pnpm dev:db        # start local Postgres + push schema
pnpm dev:api       # start the package harness at http://effect-zero-api.localhost:1355
pnpm dev           # start the ztunes browser app at http://effect-zero-ztunes.localhost:1355
pnpm dev:zero      # start Zero Cache for the browser app
```

Open [http://effect-zero-ztunes.localhost:1355](http://effect-zero-ztunes.localhost:1355).

## Verification

```bash
vp check --fix                       # lint + format
vp run test -r                       # unit tests
vp run build -r                      # build all packages
pnpm verify:client-entrypoints       # no server imports in browser bundles
pnpm verify:api                      # browser-visible targets against ztunes
pnpm verify:api:package              # full runtime × adapter matrix against examples/api
pnpm verify:mutation-stress          # browser-visible mutation ordering + replay checks
pnpm verify:mutation-stress:package  # full runtime × adapter stress checks against examples/api
```

## License

MIT
