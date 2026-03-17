# @effect-zero/v3

Effect v3 adapter for [Zero](https://zero.rocicorp.dev) server mutators.

Add Effect services, workflows, and deferred post-commit effects to your Zero
server mutations — without changing any client code.

## Install

```bash
pnpm add @effect-zero/v3
```

Choose the peer deps that match your adapter:

```bash
pnpm add @rocicorp/zero effect

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
| `@effect-zero/v3/server` | Server runtime | Zero sync handler, REST mutator handler, `extendServerMutator` |
| `@effect-zero/v3/client` | Browser-safe | Re-exports from `@rocicorp/zero` (`defineMutator`, `defineMutators`, etc.) |
| `@effect-zero/v3/server/adapters/*` | Server runtime | Adapter factories for `postgres.js`, `pg`, and Drizzle-backed Zero providers |

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

These are standard Zero mutators. No Effect dependency:

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

```ts
// zero/mutators/cart/remove.ts
import { defineMutator } from "@rocicorp/zero";
import { z } from "zod";
import { zql } from "../../schema";

export const remove = defineMutator(
  z.object({ albumId: z.string() }),
  async ({ tx, ctx, args }) => {
    if (!ctx) throw new Error("Not authenticated");
    const item = await tx.run(
      zql.cartItem.where("userId", ctx.userId).where("albumId", args.albumId).one(),
    );
    if (!item) return;
    await tx.mutate.cartItem.delete({ userId: item.userId, albumId: item.albumId });
  },
);
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

This is the only mutator import your browser code uses.

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

This is where the adapter adds value. Instead of plain async, your server
override returns an `Effect`:

```ts
// zero/mutators/cart/add.server.ts
import { extendServerMutator } from "@effect-zero/v3/server";
import { Effect } from "effect";
import { add } from "./add";
import { CartWorkflow } from "../../services/cart-workflow";

export const addServer = extendServerMutator(add, ({ args, ctx, runDefaultMutation, defer }) =>
  Effect.gen(function* () {
    // Run the shared mutator on the server transaction
    yield* runDefaultMutation();

    // Use Effect services
    const cart = yield* CartWorkflow;
    const result = yield* cart.onItemAdded({
      userId: ctx.userId,
      albumId: args.albumId,
    });

    // Register post-commit side effects
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

// Merge base mutators with server overrides.
// cart.remove has no override — keeps its default behavior.
export const serverMutators = defineMutators(mutators, {
  cart: { add: addServer },
});
```

### Step 6 — Server DB Provider

Replace `zeroPostgresJS` with the Effect-backed provider:

```ts
// zero/db.server.ts
import { createZeroDbProvider } from "@effect-zero/v3/server/adapters/drizzle";
import { schema } from "./schema";
import * as drizzleSchema from "../drizzle/schema";

export const provider = await createZeroDbProvider({
  connectionString: process.env.DATABASE_URL!,
  drizzleSchema,
  zeroSchema: schema,
  pgClientConfig: {
    // optional
    maxConnections: 64,
    idleTimeout: 30_000,
  },
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
import { createServerMutatorHandler } from "@effect-zero/v3/server";
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
      // Provide Effect service layers to overrides that need them
      executeEffect: ({ effect }) =>
        Effect.runPromise(Effect.provide(effect, CartWorkflow.Default)),
    });

    return json(await handleMutateRequest(provider.zql, handler, request));
  },
});
```

**What changed:**

1. `zeroPostgresJS(schema, sql)` → `provider.zql` (Effect-managed pool)
2. Inline `transact(...)` → `createServerMutatorHandler(...)` (handles dispatch, deferred effects, Effect execution)
3. `mutators` → `serverMutators` (includes Effect overrides)

### Step 8 — Optional REST Mutator Route

For webhooks, CLI tools, or third-party integrations, mount the same registry as
an ordinary REST API:

```ts
import { createRestMutatorHandler } from "@effect-zero/v3/server";

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

**What didn't change:**

- `handleMutateRequest` — same Zero function
- `auth.api.getSession` — same [better-auth](https://www.better-auth.com) call
- The query route — no changes needed
- Client code — completely untouched

### Step 9 — Query Route (unchanged)

No adapter needed for queries:

```ts
import { handleQueryRequest } from "@rocicorp/zero/server";
import { mustGetQuery } from "@rocicorp/zero";
import { queries } from "zero/queries";
import { schema } from "zero/schema";

return json(
  await handleQueryRequest(
    (name, args) => {
      const query = mustGetQuery(queries, name);
      return query.fn({ args, ctx });
    },
    schema,
    request,
  ),
);
```

---

## API Reference

### `createZeroDbProvider(options)`

Creates an Effect-managed Postgres connection pool backed by
[`drizzle-orm/effect-postgres`](https://orm.drizzle.team/docs/connect-effect-postgres)
and returns a Zero-compatible `ZQLDatabase`.

You can use it in two modes:

- owned connection mode: pass `connectionString` and the provider creates and
  owns the Effect Drizzle connection
- caller-owned mode: pass `db` if you already have an Effect Drizzle database
  and want the provider to wrap it without taking ownership

```ts
import { createZeroDbProvider } from "@effect-zero/v3/server/adapters/drizzle";

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

Returns:

| Property     | Type                             | Description                            |
| ------------ | -------------------------------- | -------------------------------------- |
| `zql`        | `ZQLDatabase<Schema, WrappedTx>` | Pass to `handleMutateRequest`          |
| `connection` | `EffectV3DbConnection`           | Drizzle-over-Effect managed connection |
| `dispose()`  | `() => Promise<void>`            | Shuts down the connection pool         |

If you pass `db`, `dispose()` is a no-op because the caller owns that Drizzle
database. If you pass `connectionString`, `dispose()` closes the owned
connection/runtime.

**Why both schemas?** `drizzleSchema` configures the Effect-managed Drizzle
connection (tables, relations, typed queries via `@effect/sql-pg`). `zeroSchema`
is what Zero's `ZQLDatabase` needs for ZQL queries and mutation validation.
Under the hood this creates a `ManagedRuntime` with `PgClient.layer`, builds a
Drizzle instance via `drizzle-orm/effect-postgres`, then wraps it in Zero's
`ZQLDatabase`. The plain Zero equivalent `zeroPostgresJS(schema, sql)` only
takes the Zero schema because it uses raw `postgres.js` — no Drizzle layer.

### `extendServerMutator(baseMutator, override)`

Wraps a `defineMutator` with a server-only override. The override receives:

| Parameter              | Description                                                               |
| ---------------------- | ------------------------------------------------------------------------- |
| `args`                 | Validated mutator args (typed from the base mutator's Zod schema)         |
| `ctx`                  | App context from `getContext` (userId, etc.)                              |
| `tx`                   | Zero `ServerTransaction` — includes `tx.dbTransaction` for raw SQL        |
| `runDefaultMutation()` | Runs the base mutator once in the server transaction. Optional. Max once. |
| `defer(effect)`        | Registers an Effect to run after the DB transaction commits               |

The override can return `void`, `Promise<void>`, or `Effect<void>`.

Use `runDefaultMutation()` only when you want to compose extra server-only work
around the shared mutator. If you want to fully replace the server behavior, do
not call `runDefaultMutation()`.

### `createServerMutatorHandler(options)`

Creates a handler function compatible with `handleMutateRequest`:

```ts
const handler = createServerMutatorHandler({
  mutators: serverMutators,
  getContext: (mutation) => ({ userId: "..." }),
  executeEffect: ({ effect, ctx, mutation, tx }) => ..., // optional
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

| Option          | Description                                                                 |
| --------------- | --------------------------------------------------------------------------- |
| `mutators`      | Your server mutator registry (from `defineMutators`)                        |
| `getContext`    | Resolves auth context per mutation. Receives `{ name, args, clientID, id }` |
| `executeEffect` | Optional. Runs Effect overrides with your service layers provided           |

### `createDbConnection(options)`

Lower-level API. Creates an Effect-managed Drizzle connection without the Zero
`ZQLDatabase` wrapper. Use this if you need Drizzle access outside of Zero's
mutation path.

---

## Patterns

### Simple mutator (no override needed)

Most mutators don't need an override. The shared `defineMutator` runs on both
client and server automatically:

```ts
export const rename = defineMutator(renameArgs, async ({ tx, args }) => {
  await tx.mutate.page.update({ id: args.id, title: args.title });
});
```

No `.server.ts` file needed.

### Composed override (run default + extra logic)

```ts
extendServerMutator(add, ({ args, ctx, runDefaultMutation, defer }) =>
  Effect.gen(function* () {
    yield* runDefaultMutation();
    const cart = yield* CartWorkflow;
    yield* cart.recalculate(ctx.userId, args.albumId);
    defer(analytics.track("cart.added", { userId: ctx.userId }));
  }),
);
```

Use this pattern when the client-safe mutator should still run on the server
transaction and you want to add more work around it.

### Full replacement (skip `runDefaultMutation`)

```ts
extendServerMutator(finalize, ({ args, ctx, defer }) =>
  Effect.gen(function* () {
    const workflow = yield* CheckoutWorkflow;
    yield* workflow.finalize(ctx.userId, args.checkoutId);
    defer(Effect.sync(() => sendConfirmationEmail(ctx.userId)));
  }),
);
```

Use this pattern when the server path is the mutation implementation. The base
mutator is not required in that case.

### Raw SQL in override

```ts
extendServerMutator(add, ({ args, ctx, tx }) =>
  Effect.gen(function* () {
    await tx.dbTransaction.query(
      `INSERT INTO cart_item (user_id, album_id, added_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, album_id) DO UPDATE SET added_at = EXCLUDED.added_at`,
      [ctx.userId, args.albumId, Date.now()],
    );
  }),
);
```

---

## Effect v3 Service Example

```ts
import { Effect } from "effect";

export class CartWorkflow extends Effect.Service<CartWorkflow>()("CartWorkflow", {
  effect: Effect.gen(function* () {
    const cart = yield* CartService;
    const analytics = yield* AnalyticsService;

    return {
      onItemAdded: ({ userId, albumId }: { userId: string; albumId: string }) =>
        Effect.gen(function* () {
          yield* cart.recalculate(userId);
          return {
            value: undefined,
            afterCommit: [analytics.track("cart.added", { userId, albumId })],
          };
        }),
    };
  }),
}) {}
```

Provide it via `executeEffect`:

```ts
createServerMutatorHandler({
  mutators: serverMutators,
  getContext: (mutation) => ({ userId: "..." }),
  executeEffect: ({ effect }) => Effect.runPromise(Effect.provide(effect, CartWorkflow.Default)),
});
```

---

## Migrating from Plain Zero

1. **Install** — `pnpm add @effect-zero/v3`
2. **Create `mutators.server.ts`** — re-export your existing mutators
3. **Pick an adapter** — `zeroEffectPostgresJS` for `postgres.js`, `zeroEffectNodePg` for `pg`, or `createZeroDbProvider` / `zeroEffectDrizzle` for the Drizzle lane under `@effect-zero/v3/server/adapters/*`
4. **Swap inline `transact(...)`** → `createServerMutatorHandler` in your mutate route
5. **Add `.server.ts` overrides** one mutator at a time as needed

Steps 2–4 are mechanical. Step 5 is incremental — mutators without overrides
keep working exactly as before.

## License

MIT
