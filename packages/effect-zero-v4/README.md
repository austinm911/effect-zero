# @awstin/effect-zero-v4

Effect v4 adapter for [Zero](https://zero.rocicorp.dev) server mutators.

> **Effect v4 is in beta.** This package tracks `effect@4.0.0-beta.*`.
> For the stable line, use [`@awstin/effect-zero-v3`](../effect-zero-v3).

The API surface is identical to `@awstin/effect-zero-v3` — same functions, same file
layout, same patterns. This README covers only what differs. See the
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

`@awstin/effect-zero-v4` applies equivalent compatibility patches automatically inside
the Drizzle adapter before it loads `drizzle-orm/effect-postgres`, so consumers
do not need to trust dependency `postinstall` scripts or install the PR build
manually. This is the behavior tested for `npm`, `pnpm`, and `bun`.

If you want to pre-patch an install manually, the package still ships
`node_modules/@awstin/effect-zero-v4/postinstall.mjs`, but it is not required for
normal usage.

If your environment prefers install-time patching, or blocks runtime mutation
inside `node_modules`, make sure the helper is allowed to run:

- `bun`: run `bun pm untrusted` and trust `@awstin/effect-zero-v4`, or run `node node_modules/@awstin/effect-zero-v4/postinstall.mjs` yourself after install
- `pnpm`: run `pnpm approve-builds` if you configure build-script approval, or run `node node_modules/@awstin/effect-zero-v4/postinstall.mjs` yourself after install
- `npm`: do not use `--ignore-scripts` if you want lifecycle hooks to run automatically, or run `node node_modules/@awstin/effect-zero-v4/postinstall.mjs` yourself after install

The important requirement is simple: if you rely on the shipped helper, ensure
it actually runs.

If Drizzle merges and releases the PR changes, this package should remove the
local patch layer and depend on the upstream release directly.

**The `pg` and `postgresjs` adapters work with Effect v4 without patches.**

## Import Paths

Replace `v3` with `v4` in all imports:

```ts
import { extendServerMutator, createServerMutatorHandler } from "@awstin/effect-zero-v4/server";
import { createZeroDbProvider } from "@awstin/effect-zero-v4/server/adapters/drizzle";
```

All entrypoints mirror v3:

| Import                                              | Peer dep      | What                                                                            |
| --------------------------------------------------- | ------------- | ------------------------------------------------------------------------------- |
| `@awstin/effect-zero-v4/server`                     | —             | `extendServerMutator`, `createServerMutatorHandler`, `createRestMutatorHandler` |
| `@awstin/effect-zero-v4/client`                     | —             | Re-exports from `@rocicorp/zero`                                                |
| `@awstin/effect-zero-v4/server/adapters/drizzle`    | `drizzle-orm` | `createZeroDbProvider`, `zeroEffectDrizzle`, `createDbConnection`               |
| `@awstin/effect-zero-v4/server/adapters/pg`         | `pg`          | `zeroEffectNodePg`                                                              |
| `@awstin/effect-zero-v4/server/adapters/postgresjs` | `postgres`    | `zeroEffectPostgresJS`                                                          |

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
  executeEffect: ({ effect }) => Effect.runPromise(Effect.provide(effect, CartWorkflow.layer)),
});
```

## Everything Else

Mutator definitions, `extendServerMutator`, `createServerMutatorHandler`,
`createRestMutatorHandler`, adapter factories, override patterns, deployment
rules, and migration steps are all identical to v3.

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
