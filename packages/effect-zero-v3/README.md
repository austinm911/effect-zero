# @awstin/effect-zero-v3

Effect v3 adapter for [Zero](https://zero.rocicorp.dev) server mutators.

Wrap any `defineMutator` with an Effect-powered server override — add services,
workflows, and deferred post-commit effects without changing client code.

## Install

```bash
pnpm add @awstin/effect-zero-v3 @rocicorp/zero effect
npm install @awstin/effect-zero-v3 @rocicorp/zero effect
bun add @awstin/effect-zero-v3 @rocicorp/zero effect
```

Then install the peer dependency for your chosen adapter:

| Adapter      | Peer dependency               | Install                     |
| ------------ | ----------------------------- | --------------------------- |
| `postgresjs` | `postgres`                    | `pnpm add postgres`         |
| `pg`         | `pg`                          | `pnpm add pg`               |
| `drizzle`    | `drizzle-orm` ≥ 1.0.0-beta.17 | `pnpm add drizzle-orm@beta` |

> The `drizzle` adapter requires the Drizzle 1.0 beta line for the
> `drizzle-orm/effect-postgres` entrypoint and `makeWithDefaults()` API used by
> this package. The `pg` and `postgresjs` adapters do not need drizzle-orm at all.

## Quick Start

```ts
// 1. Wrap a mutator with a server override
import { extendServerMutator } from "@awstin/effect-zero-v3/server";
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
// 2. Wire the handler directly into your app mutate route
import { handleMutateRequest } from "@rocicorp/zero/server";
import { createServerMutatorHandler } from "@awstin/effect-zero-v3/server";
import { Effect } from "effect";

export async function POST(request: Request) {
  const session = await auth.api.getSession(request);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const handler = createServerMutatorHandler({
    mutators: serverMutators,
    getContext: () => ({ userId: session.user.id }),
    executeEffect: ({ effect, runWithExecutionContext }) =>
      // Provide app/request layers, then let effect-zero execute inside the
      // active Zero request or transaction context.
      runWithExecutionContext(Effect.provide(effect, CartWorkflow.Default)),
    instrumentation: {
      observeMutation: ({ mutation }, run) =>
        // Optional: add OTEL spans, structured logs, or metrics here.
        run(),
      observeEffect: ({ phase }, run) =>
        // Optional: distinguish inline vs deferred post-commit work.
        run(),
    },
  });

  return handleMutateRequest(provider.zql, handler, request);
}
```

That's it. `handleMutateRequest` is the same Zero function. Client code is
untouched.

This remains the recommended path. Reach for `createMutationExecutor(...)` only
when you need a custom request shell or route-specific response mapping.

If `getContext(...)` and `executeEffect(...)` do not depend on the request, you
can create the handler once at module scope. If they depend on auth, request
headers, request-scoped layers, or per-request OTEL/logging context, create the
handler inside the route like the example above.

## Entrypoints

Use the root package for shared helpers that are not adapter-specific:

- timestamp conversion helpers like `dateToEpoch(...)` and `convertFieldsToEpoch(...)`
- push/error helpers like `isPushResponseLike(...)` and `asErrorShape(...)`

Use `@awstin/effect-zero-v3/server` for server mutator APIs, and keep adapter
imports on their adapter subpaths.

| Import                                              | Environment | What                                                                                                                                                                                       |
| --------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@awstin/effect-zero-v3`                            | Shared      | Shared helpers re-exported from the server/root surface: timestamp conversion helpers, push/error guards, scheduler helpers                                                                |
| `@awstin/effect-zero-v3/server`                     | Server      | `defineServerMutatorWithType`, `extendServerMutator`, `extendServerMutatorWithType`, `createServerMutatorHandler`, `createRestMutatorHandler`, `createMutationExecutor`, scheduler helpers |
| `@awstin/effect-zero-v3/client`                     | Browser     | Re-exports `defineMutator`, `defineMutators`, etc. from `@rocicorp/zero`                                                                                                                   |
| `@awstin/effect-zero-v3/server/adapters/drizzle`    | Server      | `createZeroDbProvider`, `zeroEffectDrizzle`, `createDbConnection`                                                                                                                          |
| `@awstin/effect-zero-v3/server/adapters/pg`         | Server      | `zeroEffectNodePg`                                                                                                                                                                         |
| `@awstin/effect-zero-v3/server/adapters/postgresjs` | Server      | `zeroEffectPostgresJS`                                                                                                                                                                     |

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
import { extendServerMutator } from "@awstin/effect-zero-v3/server";
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
import { createZeroDbProvider } from "@awstin/effect-zero-v3/server/adapters/drizzle";
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
import { handleMutateRequest } from "@rocicorp/zero/server";
import { createServerMutatorHandler } from "@awstin/effect-zero-v3/server";
import { Effect } from "effect";
import { serverMutators } from "zero/mutators.server";
import { provider } from "zero/db.server";

export async function POST(request: Request) {
  const session = await auth.api.getSession(request);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const handler = createServerMutatorHandler({
    mutators: serverMutators,
    getContext: () => ({ userId: session.user.id }),
    executeEffect: ({ effect, runWithExecutionContext }) =>
      // Provide app services first, then run in the active Zero execution
      // context so service calls stay transaction-aware.
      runWithExecutionContext(Effect.provide(effect, CartWorkflow.Default)),
    instrumentation: {
      observeMutation: ({ mutation }, run) =>
        // Optional: add per-mutation OTEL spans, logs, or metrics here.
        run(),
      observeEffect: ({ phase }, run) =>
        // Optional: split inline vs deferred telemetry here.
        run(),
    },
  });

  return handleMutateRequest(provider.zql, handler, request);
}
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
import { createRestMutatorHandler } from "@awstin/effect-zero-v3/server";

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

### Declarative sequencing — before, default, program, defer, after

```ts
extendServerMutator(add, ({ args, ctx, runDefaultMutation, defer }) =>
  Effect.gen(function* () {
    yield* Effect.logInfo("cart.add.before", { userId: ctx.userId, albumId: args.albumId });

    yield* runDefaultMutation();

    const workflow = yield* CartWorkflow;
    const result = yield* workflow.plan({
      albumId: args.albumId,
      userId: ctx.userId,
    });

    defer(analytics.track("cart.added", { albumId: result.albumId }));

    yield* Effect.logInfo("cart.add.after", { albumId: result.albumId });
  }),
);
```

Use normal `Effect.gen(...)` ordering:

- code before `yield* runDefaultMutation()` runs first
- `yield* program` runs immediately inside the current mutation execution
- `defer(effect)` registers post-commit work after successful commit
- code after `defer(...)` still runs immediately in the current mutation

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

If you do not call `runDefaultMutation()`, the server override completely replaces
the shared client mutator on the authoritative server path.

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

### Typed app-local server helpers

If your app wants one server-only binding for its authoritative schema,
request context, and wrapped transaction type, create it once and reuse it:

```ts
import {
  defineServerMutatorWithType,
  extendServerMutatorWithType,
} from "@awstin/effect-zero-v3/server";

type AppSchema = typeof schema;
type AuthContext = { userId: string };
type WrappedTransaction = {
  readonly drizzle: unknown;
  readonly runEffect: <A, E, R>(effect: Effect.Effect<A, E, R>) => Promise<A>;
};

export const defineAppServerMutator = defineServerMutatorWithType<
  AppSchema,
  AuthContext,
  WrappedTransaction
>();

export const extendAppServerMutator = extendServerMutatorWithType<
  AppSchema,
  AuthContext,
  WrappedTransaction
>();
```

Use `extendAppServerMutator(clientMutator, override)` when the base mutator came
from your browser-safe registry and you want server overrides with app-specific
types.

If you want the same declarative Effect return style for server-only mutators,
bind a typed `defineEffectMutatorWithType(...)` helper once and reuse it:

```ts
import { defineEffectMutatorWithType } from "@awstin/effect-zero-v3/server";

export const defineAppEffectMutator = defineEffectMutatorWithType<
  AppSchema,
  AuthContext,
  WrappedTransaction
>();

export const createServerOnly = defineAppEffectMutator(
  createWidgetSchema,
  ({ args, ctx, defer, tx }) =>
    Effect.gen(function* () {
      yield* Effect.logInfo("widget.create.before", { userId: ctx.userId });
      yield* Effect.promise(() => tx.mutate.widgets.insert(args));
      defer(Effect.sync(() => auditWidgetCreate(args.id)));
    }),
);
```

---

## API Reference

### `defineServerMutatorWithType<Schema, Context, WrappedTransaction>()`

Returns a server-only `defineMutator` binding for your app's authoritative
types. This is a thin public wrapper over Zero's `defineMutatorWithType(...)`,
so consumers can stay on the `effect-zero` surface instead of importing type
helpers from multiple packages.

### `defineEffectMutatorWithType<Schema, Context, WrappedTransaction>()`

Returns the same typed server-only binding, but allows the mutator body to
return `void`, `Promise<void>`, or `Effect<void>`. Returned Effects are executed
through the same `executeEffect(...)` runtime path used by
`extendServerMutator(...)`. The mutator input also includes `defer(effect)` for
post-commit work.

### `extendServerMutatorWithType<Schema, Context, WrappedTransaction>()`

Returns a typed wrapper around `extendServerMutator(...)` for apps whose shared
client mutators were defined without server context or wrapped transaction
types. This is the recommended way to build app-local aliases like
`extendAppServerMutator(...)`.

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

| Option                | Description                                                                 |
| --------------------- | --------------------------------------------------------------------------- |
| `mutators`            | Server mutator registry (from `defineMutators`)                             |
| `getContext`          | Resolves auth context per mutation. Receives `{ name, args, clientID, id }` |
| `executeEffect`       | Optional. Runs Effect overrides with your service layers provided           |
| `instrumentation`     | Optional. Wraps mutation/effect execution for logging, metrics, or OTEL     |
| `postCommitScheduler` | Optional. Defaults to inline scheduling after commit                        |

```ts
const handler = createServerMutatorHandler({
  mutators: serverMutators,
  getContext: (mutation) => ({ userId: "..." }),
  executeEffect: ({ effect, runWithExecutionContext }) =>
    runWithExecutionContext(Effect.provide(effect, myLayers)),
});
```

### Observability hooks

Use `instrumentation` for request-local logs, metrics, and OTEL wrappers without
coupling the package to any logger implementation:

```ts
const runCartMutationEffect = Effect.fn("cart.mutation.effect")(function* <A, E>(
  effect: Effect.Effect<A, E, never>,
) {
  return yield* effect;
});

const handler = createServerMutatorHandler({
  mutators: serverMutators,
  getContext: (mutation) => ({ userId: "..." }),
  executeEffect: ({ effect, runWithExecutionContext }) =>
    runWithExecutionContext(Effect.provide(runCartMutationEffect(effect), myLayers)),
  instrumentation: {
    observeMutation: ({ mutation, ctx }, run) => {
      console.info("mutation", mutation.name, ctx.userId);
      return run();
    },
    observeEffect: ({ mutation, phase }, run) => {
      console.debug("effect", mutation.name, phase);
      return run();
    },
  },
});
```

Using `Effect.fn(...)` for your wrapper is the easiest way to get an OTEL span
for the execution helper today.

`observeEffect` receives `phase: "inline" | "deferred"`, and
`runWithExecutionContext(...)` runs the fully-provided Effect inside the active
mutation execution context. If a transaction-scoped Effect runner exists, it is
used automatically.

For most apps, OTEL/logging belongs in two places:

- route boundary: auth, request ID, timeout handling, one request-level summary
- `instrumentation`: per-mutation spans/logs/metrics and deferred-effect spans

Keep `handleMutateRequest(...)` as the center of the route. Avoid wrapping it in
custom parse/dispatch shells unless you need non-standard transport behavior.

### `createRestMutatorHandler(options)`

Same options as `createServerMutatorHandler`. Returns a handler for direct
REST-style calls outside of Zero's sync protocol.

```ts
const handler = createRestMutatorHandler({ mutators, getContext });
await handler({ db: provider.zql, mutation: { name: "cart.add", args } });
```

### `createMutationExecutor(options)`

Advanced API. Returns the shared mutation core without any route shell.

Use this when you need to:

- keep Zero transaction semantics
- keep `extendServerMutator(...)` composition and deferred effects
- own route-level logging, metrics, and error mapping outside the package

```ts
const executeMutation = createMutationExecutor({
  mutators: serverMutators,
  getContext: (mutation) => ({ userId: session.user.id }),
  executeEffect: ({ effect, runWithExecutionContext }) =>
    runWithExecutionContext(Effect.provide(effect, myLayers)),
});

const result = await executeMutation({
  mutation,
  runTransaction: (execute) => transact((tx, name, args) => execute(tx, name, args)),
});
```

### `createInlinePostCommitScheduler()`

Runs deferred effects inline and awaits completion before the mutation response
returns. This is the default scheduler.

### `createWaitUntilPostCommitScheduler({ waitUntil, onDeferredError })`

Hands deferred effects to a worker/runtime background queue and resolves as soon
as the handoff completes.

```ts
const handler = createServerMutatorHandler({
  mutators: serverMutators,
  getContext: () => ({ userId: session.user.id }),
  executeEffect: ({ effect, runWithExecutionContext }) =>
    runWithExecutionContext(Effect.provide(effect, myLayers)),
  postCommitScheduler: createWaitUntilPostCommitScheduler({
    waitUntil,
    onDeferredError: ({ error, task }) => {
      console.error("Deferred mutation effect failed", task.mutation.name, error);
    },
  }),
});
```

### `createZeroDbProvider(options)` — Drizzle adapter

Creates an Effect-managed Postgres connection and returns a Zero-compatible
`ZQLDatabase`.

```ts
import { createZeroDbProvider } from "@awstin/effect-zero-v3/server/adapters/drizzle";

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

To return before deferred post-commit work settles, pair the handler with
`createWaitUntilPostCommitScheduler(...)`. Keep the provider request-scoped; the
background effect should rely on request context plus app services, not on a
committed transaction handle.

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
executeEffect: ({ effect, runWithExecutionContext }) =>
  runWithExecutionContext(Effect.provide(effect, CartWorkflow.Default)),
```

---

## Migrating from Plain Zero

1. `pnpm add @awstin/effect-zero-v3`
2. Pick an adapter (`postgresjs`, `pg`, or `drizzle`)
3. Create `mutators.server.ts` — re-export your existing mutators
4. Swap inline `transact(...)` → `createServerMutatorHandler` in your mutate route
5. Add `.server.ts` overrides one mutator at a time as needed

Steps 2–4 are mechanical. Step 5 is incremental — mutators without overrides
keep working exactly as before.

## License

MIT
