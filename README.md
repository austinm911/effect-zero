# effect-zero

Effect-backed server adapters for [Zero](https://zero.rocicorp.dev) mutators.

Use Effect services, workflows, and deferred post-commit effects inside Zero's
authoritative server mutation path without changing your browser-safe mutators.

## Packages

| Package                                               | Effect | Status |
| ----------------------------------------------------- | ------ | ------ |
| [`@awstin/effect-zero-v3`](./packages/effect-zero-v3) | v3     | stable |
| [`@awstin/effect-zero-v4`](./packages/effect-zero-v4) | v4     | beta   |

Install one line only:

```bash
pnpm add @awstin/effect-zero-v3
# or
pnpm add @awstin/effect-zero-v4

npm install @awstin/effect-zero-v3
# or
npm install @awstin/effect-zero-v4

bun add @awstin/effect-zero-v3
# or
bun add @awstin/effect-zero-v4
```

Choose peer deps that match your adapter:

```bash
pnpm add @rocicorp/zero effect

# Drizzle lane
pnpm add drizzle-orm@beta
# Effect v4 Drizzle lane
pnpm add drizzle-orm@1.0.0-rc.1 @effect/sql-pg@4.0.0-beta

# node-postgres lane
pnpm add pg

# postgres.js lane
pnpm add postgres
```

## What You Get

- `extendServerMutator(...)`
  Wrap a shared Zero mutator with server-only Effect logic.
- `defineServerMutatorWithType(...)` / `extendServerMutatorWithType(...)`
  Bind app-specific server context and wrapped transaction types once.
- `createServerMutatorHandler(...)`
  Plug a mutator registry into `handleMutateRequest(...)`.
- `createRestMutatorHandler(...)`
  Run the same registry through ordinary REST endpoints.
- `openapi`, `openapi/zod`, `openapi/elysia`, `openapi/hono`
  Generate REST routes, OpenAPI documents, and MCP tool definitions from mutator
  argument schemas.
- `createMutationExecutor(...)`
  Reuse the mutation core directly when your app needs a custom request shell.
- `createInlinePostCommitScheduler(...)`
  Keep the existing "await deferred work after commit" behavior.
- `createWaitUntilPostCommitScheduler(...)`
  Hand deferred work to worker runtimes without blocking the response.
- `server/adapters/postgresjs`
  Wrap `postgres.js`.
- `server/adapters/pg`
  Wrap `pg`.
- `server/adapters/drizzle`
  Wrap Effect Drizzle with either an owned connection or a caller-owned DB.

The shared client mutator stays unchanged. Only the server route and optional
server overrides move to effect-zero.

## REST/OpenAPI/MCP Contracts

The OpenAPI helper surface keeps the public API contract on the browser-safe
mutator, not on server overrides. Server overrides stay optional implementation
details; the shared mutator owns the argument schema and route documentation.

```ts
import { defineOpenapiMutator } from "@awstin/effect-zero-v3/openapi/zod";
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

The `/openapi/zod` helper keeps the Zod args schema attached to the mutator so
OpenAPI adapters can convert it into the request body schema. For Elysia, the
adapter attaches each mutator's schema and OpenAPI metadata to the route so
`@elysiajs/openapi` can read it normally. Hono and plain Fetch routes can serve
an OpenAPI document from the same registry.

effect-zero contributes generated mutator routes to your existing HTTP app; it
does not need to be a separate mutator-only API. App-owned routes such as
`/api/other-routes` should keep using their framework's normal route schemas,
OpenAPI metadata, and MCP registration. In Elysia, route-discovery MCP plugins
can expose the generated mutator routes and handwritten routes through one MCP
endpoint. In Hono, effect-zero can create the mutator REST routes and OpenAPI
paths, while `@hono/mcp` remains the transport layer for one MCP server that
registers both mutator tools and app-owned tools.

For mutators, MCP names and descriptions reuse the OpenAPI metadata by default:
`operationId` becomes the tool name, `summary` becomes the tool description, and
`description` is the fallback. Argument property descriptions should live on the
schema itself so OpenAPI and MCP clients see the same parameter help. Use
`mcp: false` only when a REST mutator should not become an MCP tool, and use
`mcp: { name, description }` only when framework-neutral MCP tool definitions
need wording that differs from the HTTP/OpenAPI wording. Elysia route-discovery
MCP plugins read the route's `operationId` and `summary`, so put shared
route/tool wording in `openapi` for that path.

## Choose A Package

- Use [`@awstin/effect-zero-v3`](./packages/effect-zero-v3) if your app already uses
  Effect v3.
- Use [`@awstin/effect-zero-v4`](./packages/effect-zero-v4) if your app is on Effect
  v4 beta.
- For the v4 Drizzle adapter specifically, use Drizzle `v1.0.0-rc.1` or newer
  with native Effect v4 support. The v4 package no longer patches Drizzle at
  runtime and does not require a manual `postinstall` step.

The server adapter API is intentionally the same across both lines. The main
difference is the underlying Effect version and the service/layer style you
provide to `executeEffect(...)`.

The recommended default path is still:

- `extendServerMutator(...)`
- `createServerMutatorHandler(...)`
- inline post-commit scheduling

Use `createMutationExecutor(...)` only when your app needs a custom route shell,
custom response mapping, or non-Zero transport behavior.

The minimal example below uses `@awstin/effect-zero-v3` with the Drizzle lane because
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
import { extendServerMutator } from "@awstin/effect-zero-v3/server";
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
import { createServerMutatorHandler } from "@awstin/effect-zero-v3/server";
import { createZeroDbProvider } from "@awstin/effect-zero-v3/server/adapters/drizzle";

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

return await handleMutateRequest({
  dbProvider: provider.zql,
  handler,
  request,
  userID: userId,
});
```

Advanced worker runtimes can swap the scheduler without rewriting the route:

```ts
const handler = createServerMutatorHandler({
  mutators: serverMutators,
  getContext: () => ({ userId }),
  executeEffect: ({ effect }) => Effect.runPromise(effect),
  postCommitScheduler: createWaitUntilPostCommitScheduler({
    waitUntil,
    onDeferredError: ({ error, task }) => {
      console.error("Deferred mutation effect failed", task.mutation.name, error);
    },
  }),
});
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
      return json(
        await handleMutateRequest({
          dbProvider: provider.zql,
          handler,
          request,
          userID: session.user.id,
        }),
      );
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

- [`@awstin/effect-zero-v3` package docs](./packages/effect-zero-v3/README.md)
- [`@awstin/effect-zero-v4` package docs](./packages/effect-zero-v4/README.md)
- [examples overview](./examples/README.md)

## Maintainer Docs

For repo-local examples, verification commands, and service bring-up, use:

- [examples/README.md](./examples/README.md)
- [RELEASING.md](./RELEASING.md)
- [AGENTS.md](./AGENTS.md)

## License

MIT
