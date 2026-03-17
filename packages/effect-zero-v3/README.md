# @effect-zero/v3

Effect v3 adapter for [Zero](https://zero.rocicorp.dev) server mutators.

Wrap any `defineMutator` with an Effect-powered server override — add services,
workflows, and deferred post-commit effects without changing client code.

## Install

```bash
pnpm add @effect-zero/v3 @rocicorp/zero effect
```

Then install the peer dependency for your chosen adapter:

| Adapter      | Peer dependency               | Install                     |
| ------------ | ----------------------------- | --------------------------- |
| `postgresjs` | `postgres`                    | `pnpm add postgres`         |
| `pg`         | `pg`                          | `pnpm add pg`               |
| `drizzle`    | `drizzle-orm` ≥ 1.0.0-beta.17 | `pnpm add drizzle-orm@beta` |

> The `drizzle` adapter requires `drizzle-orm` 1.0.0-beta.17+ for the
> `drizzle-orm/effect-postgres` entrypoint. The `pg` and `postgresjs` adapters
> do not need drizzle-orm at all.

## Quick Start

```ts
// 1. Wrap a mutator with a server override
import { extendServerMutator } from "@effect-zero/v3/server";
import { Effect } from "effect";
import { add } from "./mutators/cart/add";

export const addServer = extendServerMutator(add, ({ runDefaultMutation, defer }) =>
  Effect.gen(function* () {
    yield* runDefaultMutation(); // run the shared mutator
    defer(analytics.track("cart.added")); // fire after commit
  }),
);
```

```ts
// 2. Wire the handler in your mutate route
import { createServerMutatorHandler } from "@effect-zero/v3/server";

const handler = createServerMutatorHandler({
  mutators: serverMutators,
  getContext: () => ({ userId: session.user.id }),
  executeEffect: ({ effect }) => Effect.runPromise(Effect.provide(effect, CartWorkflow.Default)),
});

return handleMutateRequest(provider.zql, handler, request);
```

That's it. `handleMutateRequest` is the same Zero function. Client code is
untouched.

## Entrypoints

| Import                                       | Environment | What                                                                            |
| -------------------------------------------- | ----------- | ------------------------------------------------------------------------------- |
| `@effect-zero/v3/server`                     | Server      | `extendServerMutator`, `createServerMutatorHandler`, `createRestMutatorHandler` |
| `@effect-zero/v3/client`                     | Browser     | Re-exports `defineMutator`, `defineMutators`, etc. from `@rocicorp/zero`        |
| `@effect-zero/v3/server/adapters/drizzle`    | Server      | `createZeroDbProvider`, `zeroEffectDrizzle`, `createDbConnection`               |
| `@effect-zero/v3/server/adapters/pg`         | Server      | `zeroEffectNodePg`                                                              |
| `@effect-zero/v3/server/adapters/postgresjs` | Server      | `zeroEffectPostgresJS`                                                          |

## Adapters

Pick the adapter that matches your DB client:

| Adapter      | Peer dep      | When to use                              | Example                                                                 |
| ------------ | ------------- | ---------------------------------------- | ----------------------------------------------------------------------- |
| `postgresjs` | `postgres`    | Already using `postgres.js`              | `zeroEffectPostgresJS(schema, connString)`                              |
| `pg`         | `pg`          | Already using `pg` pools                 | `zeroEffectNodePg(schema, connString)`                                  |
| `drizzle`    | `drizzle-orm` | Want typed Drizzle + Effect-managed pool | `createZeroDbProvider({ connectionString, drizzleSchema, zeroSchema })` |

Every adapter supports two modes:

- **Owned** — pass a connection string → adapter creates and owns the client.
  Call `provider.dispose()` on shutdown.
- **Caller-owned** — pass your existing DB client → adapter wraps it.
  `provider.dispose()` is a no-op; you manage the lifecycle.

---

## Integration Guide

This shows how to add effect-zero to a
[ztunes](https://github.com/rocicorp/ztunes)-style app. Only the adapter-specific
parts are shown — standard Zero setup (schema, `defineMutator`, `ZeroProvider`,
query routes) stays the same.

### File Layout

```
zero/
  schema.ts              # Zero schema (drizzle-zero generated)
  mutators.ts            # browser-safe registry
  mutators.server.ts     # server registry with Effect overrides
  db.server.ts           # Effect-managed DB provider
  mutators/
    cart/
      add.ts             # shared leaf mutator (plain Zero)
      add.server.ts      # server-only Effect override ← new
app/
  routes/api/zero/
    mutate.ts            # POST handler ← modified
    query.ts             # POST handler (unchanged)
```

**Convention:** `*.server.ts` files are server-only and never imported by client
code.

### Server Override

Wrap any `defineMutator` to add server-only logic:

```ts
// zero/mutators/cart/add.server.ts
import { extendServerMutator } from "@effect-zero/v3/server";
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

### Server Mutator Registry

Merge base mutators with overrides. Mutators without an override keep their
default behavior:

```ts
// zero/mutators.server.ts
import { defineMutators } from "@rocicorp/zero";
import { mutators } from "./mutators";
import { addServer } from "./mutators/cart/add.server";

export const serverMutators = defineMutators(mutators, {
  cart: { add: addServer },
});
```

### DB Provider

```ts
// zero/db.server.ts
import { createZeroDbProvider } from "@effect-zero/v3/server/adapters/drizzle";
import { schema } from "./schema";
import * as drizzleSchema from "../drizzle/schema";

export const provider = await createZeroDbProvider({
  connectionString: process.env.DATABASE_URL!,
  drizzleSchema,
  zeroSchema: schema,
});

process.on("SIGTERM", () => provider.dispose());
```

Or wrap an existing Drizzle database:

```ts
const provider = await createZeroDbProvider({ db, zeroSchema: schema });
// dispose() is a no-op — you own the db lifecycle
```

### Mutate Route

**Before (plain Zero):**

```ts
const dbProvider = zeroPostgresJS(schema, postgres(process.env.PG_URL!));

return handleMutateRequest(
  dbProvider,
  async (transact) =>
    transact(async (tx, name, args) => {
      const mutator = mustGetMutator(mutators, name);
      await mutator.fn({ tx, ctx, args });
    }),
  request,
);
```

**After (with effect-zero):**

```ts
import { createServerMutatorHandler } from "@effect-zero/v3/server";
import { serverMutators } from "zero/mutators.server";
import { provider } from "zero/db.server";

const handler = createServerMutatorHandler({
  mutators: serverMutators,
  getContext: () => ({ userId: session.user.id }),
  executeEffect: ({ effect }) => Effect.runPromise(Effect.provide(effect, CartWorkflow.Default)),
});

return handleMutateRequest(provider.zql, handler, request);
```

Three things changed:

1. `zeroPostgresJS(schema, sql)` → `provider.zql`
2. Inline `transact(...)` → `createServerMutatorHandler(...)`
3. `mutators` → `serverMutators`

Everything else — `handleMutateRequest`, auth, query routes, client code — is
unchanged.

### REST Mutator Route (optional)

For webhooks or CLI tools, expose mutators as a plain REST API:

```ts
import { createRestMutatorHandler } from "@effect-zero/v3/server";

const restHandler = createRestMutatorHandler({
  mutators: serverMutators,
  getContext: () => ({ userId: session.user.id }),
});

await restHandler({
  db: provider.zql,
  mutation: { name: "cart.add", args: { albumId: "album_123", addedAt: Date.now() } },
});
```

This preserves `extendServerMutator` execution and deferred effects — equivalent
to [Zero's REST API](https://zero.rocicorp.dev/docs/rest) but Effect-aware.

---

## Override Patterns

### Composed — run default + extra logic

```ts
extendServerMutator(add, ({ runDefaultMutation, defer }) =>
  Effect.gen(function* () {
    yield* runDefaultMutation();
    const cart = yield* CartWorkflow;
    yield* cart.recalculate();
    defer(analytics.track("cart.added"));
  }),
);
```

### Full replacement — skip `runDefaultMutation`

```ts
extendServerMutator(finalize, ({ ctx, defer }) =>
  Effect.gen(function* () {
    const workflow = yield* CheckoutWorkflow;
    yield* workflow.finalize(ctx.userId);
    defer(Effect.sync(() => sendConfirmationEmail(ctx.userId)));
  }),
);
```

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

### No override needed

Most mutators don't need one. The shared `defineMutator` runs on both client and
server automatically — no `.server.ts` file required.

---

## API Reference

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

### `createServerMutatorHandler(options)`

Creates a handler compatible with `handleMutateRequest`.

| Option          | Description                                                                 |
| --------------- | --------------------------------------------------------------------------- |
| `mutators`      | Server mutator registry (from `defineMutators`)                             |
| `getContext`    | Resolves auth context per mutation. Receives `{ name, args, clientID, id }` |
| `executeEffect` | Optional. Runs Effect overrides with your service layers provided           |

```ts
const handler = createServerMutatorHandler({
  mutators: serverMutators,
  getContext: (mutation) => ({ userId: "..." }),
  executeEffect: ({ effect, ctx, mutation, tx }) =>
    Effect.runPromise(Effect.provide(effect, myLayers)),
});
```

### `createRestMutatorHandler(options)`

Same options as `createServerMutatorHandler`. Returns a handler for direct
REST-style calls outside of Zero's sync protocol.

```ts
const handler = createRestMutatorHandler({ mutators, getContext });
await handler({ db: provider.zql, mutation: { name: "cart.add", args } });
```

### `createZeroDbProvider(options)` — Drizzle adapter

Creates an Effect-managed Postgres connection and returns a Zero-compatible
`ZQLDatabase`.

```ts
import { createZeroDbProvider } from "@effect-zero/v3/server/adapters/drizzle";

const provider = await createZeroDbProvider({
  connectionString: "postgres://...",
  drizzleSchema, // Drizzle table/relation definitions
  zeroSchema: schema, // Zero schema (from drizzle-zero)
  pgClientConfig: {}, // optional @effect/sql-pg pool config
});
```

Returns `{ zql, connection, dispose() }`.

**Why both schemas?** `drizzleSchema` configures the Drizzle connection (tables,
relations, typed queries). `zeroSchema` is what Zero's `ZQLDatabase` needs for
ZQL queries and mutation validation. The plain Zero equivalent
`zeroPostgresJS(schema, sql)` only takes the Zero schema because it uses raw
`postgres.js` with no Drizzle layer.

### `createDbConnection(options)` — Drizzle adapter

Lower-level API. Creates an Effect-managed Drizzle connection without the Zero
`ZQLDatabase` wrapper. Use when you need Drizzle access outside of Zero's
mutation path.

### `zeroEffectPostgresJS(schema, connStringOrClient)` — postgres.js adapter

### `zeroEffectNodePg(schema, connStringOrPoolOrClient)` — pg adapter

---

## Deployment

### Long-lived Node processes

Package-owned providers can live in module scope and be reused across requests.
Dispose on shutdown:

```ts
process.on("SIGTERM", () => provider.dispose());
```

### Cloudflare Workers

Do **not** keep DB providers in module scope. Create inside the request handler,
dispose before the response returns:

```ts
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
            afterCommit: [analytics.track("cart.added", { userId, albumId })],
          };
        }),
    };
  }),
}) {}
```

Provide via `executeEffect`:

```ts
executeEffect: ({ effect }) =>
  Effect.runPromise(Effect.provide(effect, CartWorkflow.Default)),
```

---

## Migrating from Plain Zero

1. `pnpm add @effect-zero/v3`
2. Pick an adapter (`postgresjs`, `pg`, or `drizzle`)
3. Create `mutators.server.ts` — re-export your existing mutators
4. Swap inline `transact(...)` → `createServerMutatorHandler` in your mutate route
5. Add `.server.ts` overrides one mutator at a time as needed

Steps 2–4 are mechanical. Step 5 is incremental — mutators without overrides
keep working exactly as before.

## License

MIT
