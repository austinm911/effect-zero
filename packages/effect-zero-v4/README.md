# @awstin/effect-zero-v4

Effect v4 adapter for [Zero](https://zero.rocicorp.dev) server mutators.

> **Effect v4 is in beta.** This package tracks `effect@4.0.0-beta.*`.
> For the stable line, use [`@awstin/effect-zero-v3`](../effect-zero-v3).

The core runtime API surface is identical to `@awstin/effect-zero-v3` — same
handler, executor, scheduler, and override patterns. This README covers only
what differs. See the
[v3 README](../effect-zero-v3/README.md) for full documentation.

## Install

```bash
pnpm add @awstin/effect-zero-v4 @rocicorp/zero effect@4.0.0-beta
npm install @awstin/effect-zero-v4 @rocicorp/zero effect@4.0.0-beta
bun add @awstin/effect-zero-v4 @rocicorp/zero effect@4.0.0-beta
```

Then install the peer dependency for your chosen adapter:

| Adapter      | Peer dep                      | Install                     | Notes                       |
| ------------ | ----------------------------- | --------------------------- | --------------------------- |
| `postgresjs` | `postgres`                    | `pnpm add postgres`         | Stable                      |
| `pg`         | `pg`                          | `pnpm add pg`               | Stable                      |
| `drizzle`    | `drizzle-orm` ≥ 1.0.0-beta.17 | `pnpm add drizzle-orm@beta` | ⚠️ Experimental — see below |

### Drizzle Adapter on Effect v4

The `drizzle` adapter uses `drizzle-orm/effect-postgres`, which was built
against Effect v3 internals. On Effect v4, the Drizzle beta requires runtime
patches to bridge API changes (`ServiceMap`, `Effectable`, session binding).

Those patches correspond to the upstream migration work in
[drizzle-orm PR #5484](https://github.com/drizzle-team/drizzle-orm/pull/5484),
which updates Drizzle's Effect integration toward Effect v4. High level, that
work covers:

- moving service definitions to `ServiceMap`
- replacing deprecated `Schema.TaggedError` usage
- updating Effect error/export compatibility points
- fixing the compiled Effect Postgres session/runtime bindings

`@awstin/effect-zero-v4` applies equivalent compatibility patches lazily inside
the Drizzle adapter before it loads `drizzle-orm/effect-postgres`, so normal
usage does not require trusting dependency `postinstall` scripts and does not
require a manual postinstall step.

The package still ships `node_modules/@awstin/effect-zero-v4/postinstall.mjs`
as an explicit helper for environments that block runtime mutation inside
`node_modules`. Only Drizzle-adapter users in those restricted environments
need to run it.

Manual helper guidance:

- `bun`: no extra step for normal usage; only run `node node_modules/@awstin/effect-zero-v4/postinstall.mjs` if your environment blocks the runtime patch path
- `pnpm`: no extra step for normal usage; `pnpm approve-builds` is not required for this package anymore
- `npm`: no extra step for normal usage; `--ignore-scripts` does not affect the adapter because patching happens at adapter load time

If you do need the manual helper, run it once after install and before the app
first imports `@awstin/effect-zero-v4/server/adapters/drizzle`.

If Drizzle merges and releases the PR changes, this package should remove the
local patch layer and depend on the upstream release directly.

**The `pg` and `postgresjs` adapters work with Effect v4 without patches.**

## Import Paths

Replace `v3` with `v4` in all imports:

```ts
import { extendServerMutator, createServerMutatorHandler } from "@awstin/effect-zero-v4/server";
import { createZeroDbProvider } from "@awstin/effect-zero-v4/server/adapters/drizzle";
```

Use the root package for shared helpers that are not adapter-specific:

- timestamp conversion helpers like `dateToEpoch(...)` and `convertFieldsToEpoch(...)`
- push/error helpers like `isPushResponseLike(...)` and `asErrorShape(...)`

Use `@awstin/effect-zero-v4/server` for server mutator APIs, and keep adapter
imports on their adapter subpaths.

All entrypoints mirror v3:

| Import                                              | Peer dep      | What                                                                                                                         |
| --------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `@awstin/effect-zero-v4`                            | —             | Shared helpers re-exported from the server/root surface: timestamp conversion helpers, push/error guards, scheduler helpers  |
| `@awstin/effect-zero-v4/server`                     | —             | `extendServerMutator`, `createServerMutatorHandler`, `createRestMutatorHandler`, `createMutationExecutor`, scheduler helpers |
| `@awstin/effect-zero-v4/client`                     | —             | Re-exports from `@rocicorp/zero`                                                                                             |
| `@awstin/effect-zero-v4/server/adapters/drizzle`    | `drizzle-orm` | `createZeroDbProvider`, `zeroEffectDrizzle`, `createDbConnection` for Effect Drizzle databases                               |
| `@awstin/effect-zero-v4/server/adapters/pg`         | `pg`          | `zeroEffectNodePg`                                                                                                           |
| `@awstin/effect-zero-v4/server/adapters/postgresjs` | `postgres`    | `zeroEffectPostgresJS`                                                                                                       |

REST/OpenAPI helper subpaths mirror v3 as well:

| Import                                  | Peer dep | What                                                                |
| --------------------------------------- | -------- | ------------------------------------------------------------------- |
| `@awstin/effect-zero-v4/openapi`        | —        | OpenAPI registry, document helpers, and MCP tool definition helpers |
| `@awstin/effect-zero-v4/openapi/zod`    | `zod`    | `defineOpenapiMutator(...)` for Zod-backed mutator contracts        |
| `@awstin/effect-zero-v4/openapi/elysia` | `elysia` | Elysia route/plugin helpers that expose OpenAPI mutators as routes  |
| `@awstin/effect-zero-v4/openapi/hono`   | `hono`   | Hono route helpers and OpenAPI document integration                 |

## Recommended App Route

The recommended app integration is still the stock Zero mutate route shape:
authenticate in the route, build the handler, then pass it directly to
`handleMutateRequest(...)`.

```ts
import { handleMutateRequest } from "@rocicorp/zero/server";
import { createServerMutatorHandler } from "@awstin/effect-zero-v4/server";
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
      runWithExecutionContext(Effect.provide(effect, CartWorkflow.layer)),
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

If `getContext(...)` and `executeEffect(...)` do not depend on the request, you
can create the handler once at module scope. If they depend on auth, request
headers, request-scoped layers, or per-request OTEL/logging context, create the
handler inside the route like the example above.

## REST/OpenAPI Mutator Contracts

The OpenAPI helper surface is the same as v3 with `v4` import paths. Keep the
public route contract on the shared/browser-safe mutator and keep server
overrides optional.

MCP helpers reuse the same OpenAPI metadata for mutator tools:
`openapi.operationId` becomes the tool name, `openapi.summary` becomes the tool
description, and `openapi.description` is the fallback description. Omit `mcp`
for the normal path, use `mcp: false` to keep a REST mutator out of MCP, and use
`mcp: { name, description }` only when framework-neutral MCP tool definitions
need wording that differs from the HTTP/OpenAPI wording. Elysia route-discovery
MCP plugins read the route's `operationId` and `summary`, so put shared
route/tool wording in `openapi` for that path.

```ts
import { defineOpenapiMutator } from "@awstin/effect-zero-v4/openapi/zod";
import { z } from "zod";

export const addCartItemArgs = z.object({
  albumId: z.string(),
  addedAt: z.number(),
});

export const add = defineOpenapiMutator({
  args: addCartItemArgs,
  openapi: {
    operationId: "cart_add",
    summary: "Add an album to the cart",
    description: "Adds or updates the current user's cart item.",
    tags: ["Cart"],
  },
  mutate: async ({ args, ctx, tx }) => {
    await tx.mutate.cartItem.upsert({
      userId: ctx.userId,
      albumId: args.albumId,
      addedAt: tx.location === "client" ? args.addedAt : Date.now(),
    });
  },
});
```

The `/openapi/zod` subpath keeps the Zod args schema attached to the mutator.
OpenAPI output for Elysia still depends on the app's `mapJsonSchema` config, so
the route adapter registers the mutator body schema and lets `@elysiajs/openapi`
call the configured Zod-to-JSON-Schema mapper.

```ts
import { openapi } from "@elysiajs/openapi";
import { zeroMutatorRoutes } from "@awstin/effect-zero-v4/openapi/elysia";
import { Elysia } from "elysia";
import { z } from "zod";

const mutatorRoutes = zeroMutatorRoutes({
  registry: mutatorRegistry,
  prefix: "/mutators",
  run: async ({ name, args, request }) => {
    await restHandler({
      db: provider.zql,
      mutation: { name, args },
    });

    return { ok: true };
  },
});

new Elysia({ prefix: "/api" })
  .use(
    openapi({
      mapJsonSchema: {
        zod: z.toJSONSchema,
      },
    }),
  )
  .use(mutatorRoutes);
```

Elysia, Hono, and MCP setup mirrors the v3 package. The boundary is the same:
effect-zero contributes generated Zero mutator routes and metadata to your
larger API, while app-owned routes such as `/api/reports/export` stay in your
Elysia or Hono route layer.

- Elysia: use `@awstin/effect-zero-v4/openapi/elysia` to register mutator REST
  routes, `@elysiajs/openapi` to read the whole app route graph, and
  route-discovery MCP plugins such as `@8monkey/elysia-mcp` when you want one
  MCP endpoint for generated mutator routes plus handwritten API routes.
- Hono: use `@awstin/effect-zero-v4/openapi/hono` for mutator REST routes and
  `createOpenapiDocument(...)` for the mutator OpenAPI paths. Compose those
  paths with any Hono OpenAPI document for app-owned routes. `@hono/mcp` remains
  the MCP transport layer; register mutator tools from the same registry and
  app-owned tools on the same MCP server.

See the v3 README for the full REST/OpenAPI/MCP contract guidance. The only
difference is the underlying Effect runtime used by server overrides.

## Effect v4 Service Pattern

The main difference is how you define Effect services. v4 uses `ServiceMap.Service`
instead of `Effect.Service`:

**Effect v3:**

```ts
import { Effect } from "effect";

export class CartWorkflow extends Effect.Service<CartWorkflow>()("CartWorkflow", {
  effect: Effect.gen(function* () {
    return {
      onItemAdded: (input) =>
        Effect.gen(function* () {
          /* ... */
        }),
    };
  }),
}) {}

// Provide via:
Effect.provide(effect, CartWorkflow.Default);
```

**Effect v4:**

```ts
import { ServiceMap, Layer, Effect } from "effect";

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

Wire it into the handler the same way:

```ts
const handler = createServerMutatorHandler({
  mutators: serverMutators,
  getContext: () => ({ userId: session.user.id }),
  executeEffect: ({ effect, runWithExecutionContext }) =>
    runWithExecutionContext(Effect.provide(effect, CartWorkflow.layer)),
});
```

The recommended path is still `createServerMutatorHandler(...)` with the default
inline scheduler. For custom shells, use `createMutationExecutor(...)`. For
worker-style background delivery, add `postCommitScheduler:
createWaitUntilPostCommitScheduler({ waitUntil, onDeferredError })`.

## Declarative Override Pattern

The recommended authoring style is still declarative:

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

If you do not call `runDefaultMutation()`, the server override completely
replaces the shared client mutator on the authoritative server path.

## Observability

The v4 package stays logger-free. Use `instrumentation` to wrap mutation/effect
execution and `runWithExecutionContext(...)` to execute the fully-provided
Effect inside the active request or transaction context:

```ts
const runCartMutationEffect = Effect.fn("cart.mutation.effect")(function* <A, E>(
  effect: Effect.Effect<A, E, never>,
) {
  return yield* effect;
});

const handler = createServerMutatorHandler({
  mutators: serverMutators,
  getContext: () => ({ userId: session.user.id }),
  executeEffect: ({ effect, runWithExecutionContext }) =>
    runWithExecutionContext(Effect.provide(runCartMutationEffect(effect), CartWorkflow.layer)),
  instrumentation: {
    observeMutation: ({ mutation }, run) => {
      console.info("mutation", mutation.name);
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

`observeEffect` receives `phase: "inline" | "deferred"`, so background
post-commit work can be instrumented separately from in-transaction Effects.

For most apps, OTEL/logging belongs in two places:

- route boundary: auth, request ID, timeout handling, one request-level summary
- `instrumentation`: per-mutation spans/logs/metrics and deferred-effect spans

Keep `handleMutateRequest(...)` as the center of the route. Avoid wrapping it in
custom parse/dispatch shells unless you need non-standard transport behavior.

## Everything Else

Mutator definitions, `extendServerMutator`, `createServerMutatorHandler`,
`createRestMutatorHandler`, `createMutationExecutor`, scheduler helpers,
adapter factories, override patterns, deployment rules, and migration steps are
all identical to v3.

See the [v3 README](../effect-zero-v3/README.md) for:

- [Quick Start](../effect-zero-v3/README.md#quick-start)
- [Adapters](../effect-zero-v3/README.md#adapters)
- [Integration Guide](../effect-zero-v3/README.md#integration-guide)
- [Override Patterns](../effect-zero-v3/README.md#override-patterns)
- [API Reference](../effect-zero-v3/README.md#api-reference)
- [Deployment](../effect-zero-v3/README.md#deployment)
- [Migration from Plain Zero](../effect-zero-v3/README.md#migrating-from-plain-zero)

## License

MIT
