# API Examples

This package is a docs-first reference for mounting `effect-zero` in server
frameworks that are not TanStack Start.

Use it when you want:

- the standard Zero sync route for browser clients
- an optional REST façade for webhooks, third-party integrations, or CLI tools
- the same browser-safe mutator registry shared across both routes

This example does not ship app code. The runnable end-to-end example lives in
[`/Users/am/Coding/2026/effect-zero/examples/ztunes`](/Users/am/Coding/2026/effect-zero/examples/ztunes).

## The Split

Keep the mutator surface split by environment:

- `zero/mutators.ts`
  browser-safe registry for `ZeroProvider`
- `zero/mutators.server.ts`
  server-only registry with `extendServerMutator(...)` overrides

Your browser code imports only `zero/mutators.ts`.

Your server imports:

- `serverMutators` from `zero/mutators.server.ts`
- `createZeroDbProvider(...)` from `@effect-zero/v*/server/adapters/drizzle`
- `createServerMutatorHandler(...)`
- `createRestMutatorHandler(...)`

## Shared Client Mutators

The client/shared mutators should still be the source of truth. In this repo,
they are demonstrated in:

- [`@effect-zero/example-data/mutators`](/Users/am/Coding/2026/effect-zero/packages/example-data/src/mutators.ts)
- [`examples/ztunes/app/zero/mutators.ts`](/Users/am/Coding/2026/effect-zero/examples/ztunes/app/zero/mutators.ts)

That same browser-safe registry can be reused by:

- Zero browser clients through `zero.mutate(...)`
- Zero sync server routes through `handleMutateRequest(...)`
- optional REST routes through `createRestMutatorHandler(...)`

## Hono Example

Effect v3:

```ts
import { Hono } from "hono";
import { handleMutateRequest } from "@rocicorp/zero/server";
import {
  createRestMutatorHandler,
  createServerMutatorHandler,
} from "@effect-zero/v3/server";
import { createZeroDbProvider } from "@effect-zero/v3/server/adapters/drizzle";
import { serverMutators } from "./zero/mutators.server";
import * as drizzleSchema from "./drizzle/schema";
import { schema as zeroSchema } from "./zero/schema";

const provider = await createZeroDbProvider({
  connectionString: process.env.DATABASE_URL!,
  drizzleSchema,
  zeroSchema,
});

const app = new Hono();

app.post("/api/zero/mutate", async (c) => {
  const session = await getSession(c.req.raw);

  const handler = createServerMutatorHandler({
    mutators: serverMutators,
    getContext: () => ({ userId: session.user.id }),
  });

  const result = await handleMutateRequest(provider.zql, handler, c.req.raw);
  return c.json(result);
});

app.post("/api/mutators/*", async (c) => {
  const session = await getSession(c.req.raw);
  const path = c.req.path.replace(/^\\/api\\/mutators\\//, "");
  const name = path.split("/").filter(Boolean).join(".");
  const args = (await c.req.json()) as import("@rocicorp/zero").ReadonlyJSONValue;

  const restHandler = createRestMutatorHandler({
    mutators: serverMutators,
    getContext: () => ({ userId: session.user.id }),
  });

  await restHandler({
    db: provider.zql,
    mutation: {
      args,
      name,
    },
  });

  return c.json({ ok: true });
});
```

## Elysia Example

Effect v4:

```ts
import { Elysia } from "elysia";
import { handleMutateRequest } from "@rocicorp/zero/server";
import {
  createRestMutatorHandler,
  createServerMutatorHandler,
} from "@effect-zero/v4/server";
import { createZeroDbProvider } from "@effect-zero/v4/server/adapters/drizzle";
import { serverMutators } from "./zero/mutators.server";
import * as drizzleSchema from "./drizzle/schema";
import { schema as zeroSchema } from "./zero/schema";

const provider = await createZeroDbProvider({
  connectionString: process.env.DATABASE_URL!,
  drizzleSchema,
  zeroSchema,
});

export const app = new Elysia()
  .post("/api/zero/mutate", async ({ request, set }) => {
    const session = await getSession(request);

    const handler = createServerMutatorHandler({
      mutators: serverMutators,
      getContext: () => ({ userId: session.user.id }),
    });

    const result = await handleMutateRequest(provider.zql, handler, request);
    set.status = 200;
    return result;
  })
  .post("/api/mutators/*", async ({ body, params, request }) => {
    const session = await getSession(request);
    const name = String(params["*"] ?? "")
      .split("/")
      .filter(Boolean)
      .join(".");

    const restHandler = createRestMutatorHandler({
      mutators: serverMutators,
      getContext: () => ({ userId: session.user.id }),
    });

    await restHandler({
      db: provider.zql,
      mutation: {
        args: body as import("@rocicorp/zero").ReadonlyJSONValue,
        name,
      },
    });

    return { ok: true };
  });
```

## Which Route Does What

- `POST /api/zero/mutate`
  Zero browser clients use this. It must call `handleMutateRequest(...)`.
- `POST /api/mutators/cart/add`
  This is optional. Use it for REST consumers that do not speak the Zero sync protocol.

The REST route is not a replacement for the Zero sync mutate route. It is a thin
API façade over the same mutator registry.

## Recommended Consumer Layout

For consumer apps, the clean layout is:

```text
zero/
  schema.ts
  queries.ts
  mutators.ts
  mutators.server.ts
  mutators/
    cart/
      add.ts
      add.server.ts
      remove.ts
      index.ts
```

That keeps:

- browser imports clean
- DB clients out of the frontend bundle
- Zero sync and REST routes backed by the same mutator tree
