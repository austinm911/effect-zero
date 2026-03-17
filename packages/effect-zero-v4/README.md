# @effect-zero/v4

Effect v4 adapter for [Zero](https://zero.rocicorp.dev) server mutators.

Add Effect services, workflows, and deferred post-commit effects to your Zero
server mutations — without changing any client code.

> **Effect v4 is in beta.** This package tracks `effect@4.0.0-beta.*`.
> For the stable Effect v3 line, use
> [`@effect-zero/v3`](../effect-zero-v3).

## Install

```bash
pnpm add @effect-zero/v4
```

Choose the peer deps that match your adapter:

```bash
pnpm add @rocicorp/zero effect@4.0.0-beta

# Drizzle lane
pnpm add drizzle-orm

# node-postgres lane
pnpm add pg

# postgres.js lane
pnpm add postgres
```

## Entrypoints

| Import | Environment | Description |
| --- | --- | --- |
| `@effect-zero/v4/server` | Server runtime | Zero sync handler, REST mutator handler, `extendServerMutator` |
| `@effect-zero/v4/client` | Browser-safe | Re-exports from `@rocicorp/zero` (`defineMutator`, `defineMutators`, etc.) |
| `@effect-zero/v4/server/adapters/*` | Server runtime | Adapter factories for `postgres.js`, `pg`, and Drizzle-backed Zero providers |

## Choose An Adapter

| Adapter | Use when | Owned mode | Caller-owned mode |
| --- | --- | --- | --- |
| `postgresjs` | you already use `postgres.js` or want the closest plain-Zero path | `zeroEffectPostgresJS(schema, connectionString)` | `zeroEffectPostgresJS(schema, sql)` |
| `pg` | you already use `pg` pools/clients | `zeroEffectNodePg(schema, connectionString)` | `zeroEffectNodePg(schema, poolOrClient)` |
| `drizzle` | you want typed Drizzle access in server overrides | `createZeroDbProvider({ connectionString, drizzleSchema, zeroSchema })` | `createZeroDbProvider({ db, zeroSchema })` or `zeroEffectDrizzle(schema, db)` |

Ownership rule:

- If you pass a connection string, the adapter creates and owns the DB client.
- If you pass an existing DB/client, you own its lifecycle.
- In caller-owned mode, `provider.dispose()` is intentionally a no-op.

## Deployment And Lifecycle

### `runDefaultMutation()`

Call `runDefaultMutation()` only when you want to compose server-only work
around the shared browser-safe mutator.

- composed override: call it, then add more server work
- full replacement: do not call it at all

### Long-Lived Node Processes

For ordinary Node servers, package-owned providers can live in module scope and
be reused across requests. Dispose them on process shutdown.

### Cloudflare Workers

Do not keep DB providers or TCP-backed clients in module scope on Workers.
Create them inside the request handler and dispose them before the response
returns.

### Ownership Rules

- `zeroEffectPostgresJS(schema, connectionString)` creates and owns the client
- `zeroEffectPostgresJS(schema, sql)` wraps your existing client
- `zeroEffectNodePg(schema, connectionString)` creates and owns the pool
- `zeroEffectNodePg(schema, poolOrClient)` wraps your existing `pg` client/pool
- `createZeroDbProvider({ connectionString, ... })` creates and owns the Effect
  Drizzle runtime
- `createZeroDbProvider({ db, ... })` and `zeroEffectDrizzle(schema, db)` wrap
  your existing Effect Drizzle database

Dispose rule:

- package-owned mode: call `await provider.dispose()`
- caller-owned mode: `provider.dispose()` is a no-op and you dispose your own
  DB/client/runtime

---

## Example: Adding Effect to a Zero App

This walks through the setup for a [ztunes](https://github.com/rocicorp/ztunes)-style
app — TanStack Start with Zero for client sync and server mutate/query routes.

### File Layout

```
zero/
  schema.ts              # drizzle-zero generated
  queries.ts             # defineQueries(...)
  mutators.ts            # browser-safe registry
  mutators.server.ts     # server-only registry with Effect overrides
  mutators/
    cart/
      add.ts             # shared leaf mutator
      add.server.ts      # server-only Effect override
      remove.ts          # shared leaf (no override needed)
      index.ts           # barrel export

app/
  components/
    zero-init.tsx         # ZeroProvider wrapper
  routes/
    api/zero/
      mutate.ts           # POST handler
      query.ts            # POST handler
```

**Rules:**

- `*.ts` leaf files are browser-safe
- `*.server.ts` files are server-only — never imported by `zero-init.tsx`
- `mutators.ts` is what the browser imports
- `mutators.server.ts` is what the server route imports

### Step 1 — Shared Mutators (no changes from plain Zero)

Standard Zero mutators. No Effect dependency:

```ts
// zero/mutators/cart/add.ts
import { defineMutator } from "@rocicorp/zero";
import { z } from "zod";

export const cartAddArgs = z.object({
  albumId: z.string(),
  addedAt: z.number(),
});

export const add = defineMutator(cartAddArgs, async ({ tx, ctx, args }) => {
  if (!ctx) throw new Error("Not authenticated");

  await tx.mutate.cartItem.insert({
    userId: ctx.userId,
    albumId: args.albumId,
    addedAt: tx.location === "client" ? args.addedAt : Date.now(),
  });
});
```

### Step 2 — Client Mutator Registry (no changes from plain Zero)

```ts
// zero/mutators.ts — browser-safe
import { defineMutators } from "@rocicorp/zero";
import { add, remove } from "./mutators/cart";

export const mutators = defineMutators({
  cart: { add, remove },
});
```

### Step 3 — ZeroProvider (no changes from plain Zero)

```tsx
// app/components/zero-init.tsx
import { ZeroProvider } from "@rocicorp/zero/react";
import { schema } from "zero/schema";
import { mutators } from "zero/mutators";

export function ZeroInit({ children }: { children: React.ReactNode }) {
  return (
    <ZeroProvider
      schema={schema}
      userID={useCurrentUserId()}
      mutators={mutators}
      cacheURL={import.meta.env.VITE_PUBLIC_ZERO_CACHE_URL}
    >
      {children}
    </ZeroProvider>
  );
}
```

### Step 4 — Server Override with Effect

```ts
// zero/mutators/cart/add.server.ts
import { extendServerMutator } from "@effect-zero/v4/server";
import { Effect } from "effect";
import { add } from "./add";
import { CartWorkflow } from "../../services/cart-workflow";

export const addServer = extendServerMutator(add, ({ args, ctx, runDefaultMutation, defer }) =>
  Effect.gen(function* () {
    yield* runDefaultMutation();

    const cart = yield* CartWorkflow;
    const result = yield* cart.onItemAdded({
      userId: ctx.userId,
      albumId: args.albumId,
    });

    for (const effect of result.afterCommit) {
      defer(effect);
    }
  }),
);
```

### Step 5 — Server Mutator Registry

```ts
// zero/mutators.server.ts
import { defineMutators } from "@rocicorp/zero";
import { mutators } from "./mutators";
import { addServer } from "./mutators/cart/add.server";

export const serverMutators = defineMutators(mutators, {
  cart: { add: addServer },
});
```

### Step 6 — Server DB Provider

```ts
// zero/db.server.ts
import { createZeroDbProvider } from "@effect-zero/v4/server/adapters/drizzle";
import { schema } from "./schema";
import * as drizzleSchema from "../drizzle/schema";

export const provider = await createZeroDbProvider({
  connectionString: process.env.DATABASE_URL!,
  drizzleSchema,
  zeroSchema: schema,
});

process.on("SIGTERM", () => provider.dispose());
```

If you already have an Effect Drizzle database, pass it directly instead:

```ts
const provider = await createZeroDbProvider({
  db,
  zeroSchema: schema,
});
```

> On Cloudflare Workers, do not keep this provider in module scope. Create it
> inside the request handler and dispose it before the response returns.

Example:

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

### Step 7 — Server Mutate Route

**Before (plain Zero — [ztunes](https://github.com/rocicorp/ztunes) style):**

```ts
import { json } from "@tanstack/react-start";
import { createServerFileRoute } from "@tanstack/react-start/server";
import { handleMutateRequest } from "@rocicorp/zero/server";
import { zeroPostgresJS } from "@rocicorp/zero/server/adapters/postgresjs";
import { mustGetMutator } from "@rocicorp/zero";
import postgres from "postgres";
import { auth } from "auth/auth";
import { schema } from "zero/schema";
import { mutators } from "zero/mutators";

const dbProvider = zeroPostgresJS(schema, postgres(process.env.PG_URL!));

export const ServerRoute = createServerFileRoute("/api/zero/mutate").methods({
  POST: async ({ request }) => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }
    const ctx = { userId: session.user.id };

    return json(
      await handleMutateRequest(
        dbProvider,
        async (transact) =>
          transact(async (tx, name, args) => {
            const mutator = mustGetMutator(mutators, name);
            await mutator.fn({ tx, ctx, args });
          }),
        request,
      ),
    );
  },
});
```

**After (with effect-zero):**

```ts
import { json } from "@tanstack/react-start";
import { createServerFileRoute } from "@tanstack/react-start/server";
import { handleMutateRequest } from "@rocicorp/zero/server";
import { createServerMutatorHandler } from "@effect-zero/v4/server";
import { Effect } from "effect";
import { auth } from "auth/auth";
import { serverMutators } from "zero/mutators.server";
import { provider } from "zero/db.server";
import { CartWorkflow } from "../services/cart-workflow";

export const ServerRoute = createServerFileRoute("/api/zero/mutate").methods({
  POST: async ({ request }) => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    const handler = createServerMutatorHandler({
      mutators: serverMutators,
      getContext: () => ({ userId: session.user.id }),
      executeEffect: ({ effect }) => Effect.runPromise(Effect.provide(effect, CartWorkflow.layer)),
    });

    return json(await handleMutateRequest(provider.zql, handler, request));
  },
});
```

**What changed:**

1. `zeroPostgresJS(schema, sql)` → `provider.zql` (Effect-managed pool)
2. Inline `transact(...)` → `createServerMutatorHandler(...)` (handles dispatch, deferred effects, Effect execution)
3. `mutators` → `serverMutators` (includes Effect overrides)

**What didn't change:**

- `handleMutateRequest` — same Zero function
- `auth.api.getSession` — same [better-auth](https://www.better-auth.com) call
- The query route — no changes needed
- Client code — completely untouched

### Step 8 — Optional REST Mutator Route

For webhooks, CLI tools, or third-party integrations, mount the same registry as
an ordinary REST API:

```ts
import { createRestMutatorHandler } from "@effect-zero/v4/server";

const restHandler = createRestMutatorHandler({
  getContext: () => ({ userId: session.user.id }),
  mutators: serverMutators,
});

export async function postDirectMutator(request: Request, name: string) {
  const args = (await request.json()) as import("@rocicorp/zero").ReadonlyJSONValue;

  await restHandler({
    db: provider.zql,
    mutation: {
      args,
      name,
    },
  });

  return Response.json({ ok: true });
}
```

This is the package-level equivalent of the pattern described in
[Zero REST docs](https://zero.rocicorp.dev/docs/rest), but it preserves
`extendServerMutator(...)` execution state and deferred post-commit effects.

### Step 9 — Query Route (unchanged)

No adapter needed for queries — same as ztunes.

---

## API Reference

### `createZeroDbProvider(options)`

Effect-managed Postgres connection pool backed by
[`drizzle-orm/effect-postgres`](https://orm.drizzle.team/docs/connect-effect-postgres)
→ Zero-compatible `ZQLDatabase`.

You can use it in two modes:

- owned connection mode: pass `connectionString` and the provider creates and
  owns the Effect Drizzle connection
- caller-owned mode: pass `db` if you already have an Effect Drizzle database
  and want the provider to wrap it without taking ownership

```ts
import { createZeroDbProvider } from "@effect-zero/v4/server/adapters/drizzle";

// Provider owns the connection lifecycle
const provider = await createZeroDbProvider({
  connectionString: "postgres://...",
  drizzleSchema, // Drizzle table/relation definitions
  zeroSchema: schema, // Zero schema (from drizzle-zero)
  pgClientConfig: {}, // optional @effect/sql-pg pool config
});

// You already own the Drizzle database lifecycle
const providerFromDb = await createZeroDbProvider({
  db,
  zeroSchema: schema,
});
```

> On Cloudflare Workers, create the provider inside the request handler and
> dispose it before returning. Do not cache Drizzle, `pg`, or `postgres.js`
> clients across requests.

Example:

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

Returns `{ zql, connection, dispose() }`.

If you pass `db`, `dispose()` is a no-op because the caller owns that Drizzle
database. If you pass `connectionString`, `dispose()` closes the owned
connection/runtime.

**Why both schemas?** `drizzleSchema` configures the Effect-managed Drizzle
connection (tables, relations, typed queries via `@effect/sql-pg`). `zeroSchema`
is what Zero's `ZQLDatabase` needs for ZQL queries and mutation validation.
Under the hood this creates a `ManagedRuntime` with `PgClient.layer`, builds
a Drizzle instance via `drizzle-orm/effect-postgres`, then wraps it in Zero's
`ZQLDatabase`. The plain Zero equivalent `zeroPostgresJS(schema, sql)` only
takes the Zero schema because it uses raw `postgres.js` — no Drizzle layer.

### `extendServerMutator(baseMutator, override)`

Wraps a `defineMutator` with a server-only override:

| Parameter              | Description                                                        |
| ---------------------- | ------------------------------------------------------------------ |
| `args`                 | Validated mutator args                                             |
| `ctx`                  | App context from `getContext`                                      |
| `tx`                   | Zero `ServerTransaction` — includes `tx.dbTransaction` for raw SQL |
| `runDefaultMutation()` | Runs the base mutator once. Optional. Max once.                    |
| `defer(effect)`        | Registers an Effect to run after the DB transaction commits        |

Override can return `void`, `Promise<void>`, or `Effect<void>`.

Use `runDefaultMutation()` only when you want to compose extra server-only work
around the shared mutator. If you want to fully replace the server behavior, do
not call `runDefaultMutation()`.

### `createServerMutatorHandler(options)`

Creates a handler compatible with `handleMutateRequest`:

```ts
createServerMutatorHandler({
  mutators: serverMutators,
  getContext: (mutation) => ({ userId: "..." }),
  executeEffect: ({ effect }) => ..., // optional
});
```

### `createRestMutatorHandler(options)`

Creates a framework-agnostic handler for ordinary REST-style mutator calls:

```ts
const restHandler = createRestMutatorHandler({
  mutators: serverMutators,
  getContext: () => ({ userId: "..." }),
});

await restHandler({
  db: provider.zql,
  mutation: {
    name: "cart.add",
    args: { albumId: "album_123", addedAt: Date.now() },
  },
});
```

Use this for routes like `POST /api/mutators/cart/add` in Hono, Elysia, TanStack
Start, or any other framework that can parse a `Request`.

### `createDbConnection(options)`

Lower-level: Effect-managed Drizzle connection without the Zero `ZQLDatabase` wrapper.

---

## Differences from v3

The adapter API is identical. The only differences are:

### Import path

```ts
// v3
import { ... } from "@effect-zero/v3/server";

// v4
import { ... } from "@effect-zero/v4/server";
```

### Service definitions

Effect v4 uses `ServiceMap.Service` instead of `Effect.Service`:

```ts
// Effect v3
export class CartWorkflow extends Effect.Service<CartWorkflow>()("CartWorkflow", {
  effect: Effect.gen(function* () {
    return { onItemAdded: (...) => ... };
  }),
}) {}

// Provide via:
Effect.provide(effect, CartWorkflow.Default)
```

```ts
// Effect v4
import { ServiceMap, Layer } from "effect";

export class CartWorkflow extends ServiceMap.Service<
  CartWorkflow,
  {
    readonly onItemAdded: (input: {
      userId: string;
      albumId: string;
    }) => Effect.Effect<{ afterCommit: ReadonlyArray<Effect.Effect<void>> }>;
  }
>()("CartWorkflow") {
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide(CartService.layer),
    Layer.provide(AnalyticsService.layer),
  );
}

// Provide via:
Effect.provide(effect, CartWorkflow.layer);
```

### Everything else is the same

Mutator definitions, file layout, `extendServerMutator`, `createServerMutatorHandler`,
and the adapter factories under `server/adapters/*` are identical between v3 and v4.

---

## Migrating from Plain Zero

1. **Install** — `pnpm add @effect-zero/v4`
2. **Create `mutators.server.ts`** — re-export your existing mutators
3. **Pick an adapter** — `zeroEffectPostgresJS` for `postgres.js`, `zeroEffectNodePg` for `pg`, or `createZeroDbProvider` / `zeroEffectDrizzle` for the Drizzle lane under `@effect-zero/v4/server/adapters/*`
4. **Swap inline `transact(...)`** → `createServerMutatorHandler`
5. **Add `.server.ts` overrides** one mutator at a time as needed

Steps 2–4 are mechanical. Step 5 is incremental.

## License

MIT
