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

  return handleMutateRequest({
    dbProvider: provider.zql,
    handler,
    request,
    userID: session.user.id,
  });
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
| `@awstin/effect-zero-v3/openapi`                    | Shared      | OpenAPI registry, document helpers, and MCP tool definition helpers                                                                                                                        |
| `@awstin/effect-zero-v3/openapi/zod`                | Shared      | `defineOpenapiMutator(...)` and `defineOpenapiMutatorWithType(...)` for Zod-backed contracts                                                                                               |
| `@awstin/effect-zero-v3/openapi/elysia`             | Server      | Elysia route helpers that expose OpenAPI mutators as REST routes                                                                                                                           |
| `@awstin/effect-zero-v3/openapi/hono`               | Server      | Hono route helpers that expose OpenAPI mutators as REST routes                                                                                                                             |
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

return handleMutateRequest({
  dbProvider,
  handler: async (transact) =>
    transact(async (tx, name, args) => {
      const mutator = mustGetMutator(mutators, name);
      await mutator.fn({ tx, ctx, args });
    }),
  request,
  userID: ctx.userId,
});
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

  return handleMutateRequest({
    dbProvider: provider.zql,
    handler,
    request,
    userID: session.user.id,
  });
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

### REST/OpenAPI Mutator Contracts

The OpenAPI helper surface keeps the public API contract on the browser-safe
mutator. Put the argument schema and route documentation next to the shared
client/default mutator, then let server overrides stay focused on authoritative
implementation details.

Use a route-like object: `args` is the browser-safe schema, `openapi` is the
route contract, and `mutate` is the normal Zero mutator body. The helper is named
for the contract it produces: this metadata is the OpenAPI route contract, not
generic inline documentation.

MCP helpers reuse the same metadata for mutator tools. `openapi.operationId`
becomes the MCP tool name, `openapi.summary` becomes the tool description, and
`openapi.description` is the fallback description. Only add `mcp` metadata when
you need to opt a mutator out or override the MCP wording for that one mutator.
Omitting `mcp` is the normal path. Use `mcp: false` for a public REST mutator
that should not become an MCP tool, or `mcp: { name, description }` when an
agent-facing tool needs wording that differs from the HTTP/OpenAPI wording and
you are registering framework-neutral MCP tool definitions. Elysia
route-discovery MCP plugins read the route's `operationId` and `summary`, so put
shared route/tool wording in `openapi` for that path.

```ts
// zero/mutators/cart/add.ts
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

Build the normal Zero mutator registry from OpenAPI definitions:

```ts
// zero/mutators.ts
import { defineOpenapiMutators } from "@awstin/effect-zero-v3/openapi";
import { add } from "./mutators/cart/add";
import { remove } from "./mutators/cart/remove";

export const mutatorRegistry = defineOpenapiMutators({
  cart: {
    add,
    remove,
  },
});

export const mutators = mutatorRegistry.mutators;
```

If a mutator needs server-only logic, keep the docs on the shared contract and
wrap that contract from a server-only sidecar:

```ts
// zero/mutators/cart/add.server.ts
import { extendServerMutator } from "@awstin/effect-zero-v3/server";
import { Effect } from "effect";
import { add } from "./add";

export const addServer = extendServerMutator(add, ({ runDefaultMutation, defer }) =>
  Effect.gen(function* () {
    yield* runDefaultMutation();
    defer(analytics.track("cart.added"));
  }),
);
```

#### Boundary: Generated Mutator Routes Inside Your API

The registry is the single source of truth for the Zero mutator part of your
API:

- REST endpoints for each mutator
- OpenAPI operations for those mutator endpoints
- MCP tool definitions for those mutator endpoints when your framework MCP layer
  discovers route metadata or when you register MCP tools from the same registry

That does not mean your API is mutator-only. effect-zero contributes generated
mutator routes to the same Elysia or Hono app that also owns routes such as
`/api/search`, `/api/reports`, or `/api/other-routes`. Keep those app-owned
routes in the framework layer with the framework's normal schemas, OpenAPI
metadata, and MCP registration. The final OpenAPI document or MCP server can
then include both the generated mutator routes and your handwritten API routes.

#### Elysia: REST + OpenAPI

For Elysia, register real routes from the OpenAPI registry. The adapter attaches
each mutator's `body` schema and OpenAPI metadata to the Elysia route so
`@elysiajs/openapi` can extract the spec the same way it does for handwritten
routes.

```ts
import { openapi } from "@elysiajs/openapi";
import { zeroMutatorRoutes } from "@awstin/effect-zero-v3/openapi/elysia";
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

With the Zod subpath, the mutator args schema is a Zod schema. Elysia OpenAPI
can include non-TypeBox schemas when the app config maps that validator to JSON
Schema:

```ts
openapi({
  mapJsonSchema: {
    zod: z.toJSONSchema,
  },
});
```

Other validator subpaths should follow the same rule: the adapter can register
the route in Elysia, but OpenAPI output still needs a JSON Schema mapper for the
validator that owns the args schema.

#### Elysia: Whole API + MCP

Elysia MCP plugins that discover route metadata can expose the whole Elysia API,
including generated mutator routes and handwritten routes. For example,
`@8monkey/elysia-mcp` reads Elysia route `body` schemas plus `detail.operationId`
and `detail.summary`. The mutator adapter produces those fields for mutator
routes, and you provide them directly on your app-owned routes.

```ts
import { openapi } from "@elysiajs/openapi";
import { mcp } from "@8monkey/elysia-mcp";
import { zeroMutatorRoutes } from "@awstin/effect-zero-v3/openapi/elysia";
import { Elysia } from "elysia";
import { z } from "zod";

const app = new Elysia()
  .use(
    openapi({
      mapJsonSchema: {
        zod: z.toJSONSchema,
      },
    }),
  )
  .use(
    zeroMutatorRoutes({
      mcp: true,
      registry: mutatorRegistry,
      prefix: "/api/mutators",
      run: async ({ name, args, request }) => {
        await restHandler({
          db: provider.zql,
          mutation: { name, args },
        });

        return { ok: true };
      },
    }),
  )
  .post("/api/reports/export", ({ body }) => reports.export(body), {
    body: z.object({
      reportId: z.string().describe("Report ID to export."),
      format: z.enum(["csv", "json"]).describe("Export file format."),
    }),
    detail: {
      operationId: "export_report",
      summary: "Export a report",
      mcp: true,
    },
  })
  .use(
    mcp({
      name: "music-api",
      version: "1.0.0",
      path: "/mcp",
      allRoutes: false,
    }),
  );
```

In this shape, `/mcp` exposes one MCP server for the whole Elysia API. Mutator
tools come from `mutatorRegistry`; non-mutator tools come from ordinary Elysia
routes. `zeroMutatorRoutes({ mcp: true })` adds `detail.mcp: true` to generated
mutator routes so opt-in route-discovery plugins can include them. The mutator
tool names and descriptions still come from `openapi.operationId`,
`openapi.summary`, and `openapi.description`. Use `mcp: false` on a mutator to
keep it out of route-discovery MCP output. `mcp: { name, description }` is for
the framework-neutral MCP tool-definition helpers; Elysia route-discovery
plugins do not have a separate naming channel from ordinary route metadata.

MCP-friendly mutator args should be object schemas with property descriptions.
Agents use those descriptions to decide when and how to call the tool:

```ts
export const addCartItemArgs = z.object({
  albumId: z.string().describe("Album ID to add to the cart."),
  addedAt: z.number().describe("Client timestamp in milliseconds."),
});
```

#### Hono: Whole API + OpenAPI

For Hono or a plain Fetch route, use the same registry and execution callback.
The generated mutator routes can sit next to any other Hono route. Hono does not
have the same built-in route metadata discovery path as Elysia, so serve or
compose the OpenAPI document from the registry directly:

```ts
import { createOpenapiDocument } from "@awstin/effect-zero-v3/openapi";
import { zeroMutatorRoutes } from "@awstin/effect-zero-v3/openapi/hono";
import { Hono } from "hono";

const app = new Hono();

app.route(
  "/api/mutators",
  zeroMutatorRoutes({
    registry: mutatorRegistry,
    run: async ({ name, args }) => {
      await restHandler({
        db: provider.zql,
        mutation: { name, args },
      });

      return { ok: true };
    },
  }),
);

app.post("/api/reports/export", async (c) => {
  const body = await c.req.json();
  return c.json(await reports.export(body));
});

app.get("/openapi.json", (c) =>
  c.json(
    createOpenapiDocument(mutatorRegistry, {
      info: {
        title: "Music Mutator API",
        version: "1.0.0",
      },
      pathPrefix: "/api/mutators",
    }),
  ),
);
```

If you already use a Hono OpenAPI library for app-owned routes, merge the mutator
paths from `createOpenapiDocument(...)` into that app-level document. effect-zero
generates the mutator paths; your Hono OpenAPI layer owns the rest of the API.

#### Hono: Whole API + MCP

`@hono/mcp` provides the MCP transport and auth pieces for Hono. It does not
auto-discover Hono routes from OpenAPI metadata the way Elysia route-discovery
plugins can. Keep the boundary explicit:

- effect-zero creates mutator REST routes and mutator tool metadata from
  `mutatorRegistry`
- your app registers app-owned tools on the same MCP server
- `@hono/mcp` mounts that one MCP server

Reuse the same mutator registry and execution callback for Hono MCP tool
registration so the tool names, descriptions, schemas, and execution path still
come from one place. `createMcpToolDefinition(...)` reuses
`openapi.operationId`, `openapi.summary`, `openapi.description`, and the args
schema JSON Schema. It also respects `mcp: false` and
`mcp: { name, description }` on each mutator. Do not duplicate the mutator
implementation in a separate MCP handler.

```ts
import { createMcpToolDefinition, getOpenapiMutatorEntries } from "@awstin/effect-zero-v3/openapi";
import { StreamableHTTPTransport } from "@hono/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const mcpServer = new McpServer({
  name: "music-api",
  version: "1.0.0",
});

for (const entry of getOpenapiMutatorEntries(mutatorRegistry)) {
  const tool = createMcpToolDefinition(entry);
  if (!tool) continue;

  // Register one MCP tool using your MCP SDK schema adapter.
  // tool.name comes from openapi.operationId.
  // tool.description comes from openapi.summary.
  // tool.inputSchema comes from the mutator args schema.
  //
  // The tool handler should call the same restHandler used by the REST route:
  //
  // await restHandler({
  //   db: provider.zql,
  //   mutation: { name: entry.name, args },
  // });
}

// Register app-owned tools on the same MCP server. Keep their handlers close to
// the Hono routes that own the behavior.
//
// mcpServer.tool("export_report", exportReportSchema, async (args) => {
//   return toMcpContent(await reports.export(args));
// });

const transport = new StreamableHTTPTransport();

app.all("/mcp", async (c) => {
  if (!mcpServer.isConnected()) {
    await mcpServer.connect(transport);
  }

  return transport.handleRequest(c);
});
```

The subpaths follow the same single-package pattern as Drizzle's integration
exports:

| Import                                  | Peer dep | What                                                                |
| --------------------------------------- | -------- | ------------------------------------------------------------------- |
| `@awstin/effect-zero-v3/openapi`        | —        | OpenAPI registry, document helpers, and MCP tool definition helpers |
| `@awstin/effect-zero-v3/openapi/zod`    | `zod`    | `defineOpenapiMutator(...)` for Zod-backed mutator contracts        |
| `@awstin/effect-zero-v3/openapi/elysia` | `elysia` | Elysia route/plugin helpers that expose OpenAPI mutators as routes  |
| `@awstin/effect-zero-v3/openapi/hono`   | `hono`   | Hono route helpers and OpenAPI document integration                 |

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

Effect service requirements are inferred from returned and deferred Effects. If
any mutator in the registry requires services, `createServerMutatorHandler(...)`
and `createMutationExecutor(...)` require `executeEffect` so those services are
provided at the request boundary.

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
| `executeEffect`       | Required when mutators need Effect services; otherwise optional             |
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
