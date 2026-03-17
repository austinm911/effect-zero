# Desired Mutator API

This document defines the desired Zero + Effect mutator API for this repo.

It is written as if these assumptions had been foundational from the start:

- mutator names come from Zero registries, not manual strings
- client imports must never pull DB clients or server runtimes into browser bundles
- the common case must remain simple and close to native Zero
- server-only Effect logic must compose cleanly with Zero's server `ServerTransaction`
- authoring 100 mutators must stay maintainable

This is the target design for both publishable lines:

- `@awstin/effect-zero-v3`
- `@awstin/effect-zero-v4`

## Foundational Assumptions

1. A logical mutator is a leaf module.

2. Mutator names come from nested `defineMutators(...)` registry paths.

3. The client app imports only a browser-safe mutator registry.

4. Server-only Effect logic lives in optional sidecar files, not in modules that
   `zero-init.tsx` imports.

5. If there is no server override, Zero keeps its default behavior:
   the same mutator runs optimistically on the client and authoritatively on the
   server.

6. If there is a server override, it may either:
   - fully replace the default/shared mutator behavior
   - compose with the default/shared mutator by calling `runDefaultMutation()`

7. `runDefaultMutation()` is optional.

8. Post-commit side effects should not be hidden deep inside low-level DB
   services by default.

## Desired Package Surface

The public package surface should separate client-safe and server-only imports.

For v3:

- `@awstin/effect-zero-v3/client`
- `@awstin/effect-zero-v3/server`

For v4:

- `@awstin/effect-zero-v4/client`
- `@awstin/effect-zero-v4/server`

Optional later:

- `@awstin/effect-zero-v3/testing`
- `@awstin/effect-zero-v4/testing`

Client entrypoints must be browser-safe. Server entrypoints may import:

- Drizzle DB clients
- Zero `ServerTransaction`
- Effect runtimes and service layers

## Core API

The core API should stay close to native Zero.

### Client/default leaf

Keep native Zero `defineMutator(...)` as the primitive.

```ts
export const add = defineMutator(cartAddArgs, async ({ tx, args, ctx }) => {
  if (!ctx) throw new Error("Not authenticated");

  await tx.mutate.cartItem.insert({
    userId: ctx.userId,
    albumId: args.albumId,
    addedAt: tx.location === "client" ? args.addedAt : Date.now(),
  });
});
```

This preserves:

- native Zero typing
- client `Transaction`
- server fallback behavior
- no manual naming

### Server override helper

Add one server helper:

- `extendServerMutator(baseMutator, override)`

Conceptually:

```ts
export const addServer = extendServerMutator(add, ({ args, ctx, tx, runDefaultMutation, defer }) =>
  Effect.gen(function* () {
    yield* runDefaultMutation();

    const workflow = yield* AddToCartWorkflow;
    const result = yield* workflow.execute({
      userId: ctx.userId,
      albumId: args.albumId,
    });

    for (const effect of result.afterCommit) {
      defer(effect);
    }
  }),
);
```

The override callback receives:

- `tx`
  Zero `ServerTransaction<Schema, WrappedTx>`
- `args`
  validated mutator args
- `ctx`
  app auth/request context
- `runDefaultMutation()`
  optional helper that runs the base `defineMutator(...)` implementation once
- `defer(effect)`
  registers work to run only after the outer DB transaction commits

## Why This API

This keeps the API small:

- use native `defineMutator(...)` for the common case
- add one server composition primitive for the authoritative server case

It also avoids the worse alternatives:

- no manual mutator names
- no giant single mutation-spec object
- no forced duplication of every mutator into client and server versions
- no codegen requirement for basic correctness

## File Layout

This is the desired structure for a real app package.

```txt
zero/
  mutators.ts
  mutators.server.ts
  mutators/
    cart/
      add.ts
      add.server.ts
      remove.ts
      index.ts
    pages/
      create.ts
      create.server.ts
      update-content.ts
      index.ts
```

Rules:

- `*.ts` leaf files under `mutators/` are client-safe by default
- `*.server.ts` sidecars are server-only
- `mutators.ts` assembles the browser-safe registry
- `mutators.server.ts` assembles server overrides on top of the client registry

## How The Pieces Relate

### 1. Leaf mutator file

Defines the default/shared behavior with native Zero `defineMutator(...)`.

This is what gives client optimism and also the default authoritative server
behavior when no override exists.

### 2. Server sidecar file

Optionally composes with or replaces the leaf behavior.

This is where Effect services, workflows, raw SQL, and wrapped native Drizzle
access belong.

### 3. Client registry

Built with nested `defineMutators(...)`.

This is what `zero-init.tsx` imports.

### 4. Server registry

Built from the client registry plus overrides.

This is what the Zero mutate route uses with `handleMutateRequest(...)`.

## Example: Client Registry

```ts
// zero/mutators.ts
import { defineMutators } from "@rocicorp/zero";

import { cartMutators } from "./mutators/cart";
import { pageMutators } from "./mutators/pages";

export const mutators = defineMutators({
  cart: cartMutators,
  pages: pageMutators,
});
```

This is the safe import used by `zero-init.tsx`.

```ts
import { mutators } from "@app/zero/mutators";
```

## Example: Server Registry

```ts
// zero/mutators.server.ts
import { defineMutators } from "@rocicorp/zero";

import { mutators as baseMutators } from "./mutators";
import { cartServerMutators } from "./mutators/cart/index.server";
import { pageServerMutators } from "./mutators/pages/index.server";

export const serverMutators = defineMutators(baseMutators, {
  cart: cartServerMutators,
  pages: pageServerMutators,
});
```

This preserves the important Zero behavior:

- if a leaf has no override, the default/shared mutator is used on the server
- if a leaf has an override, the override replaces the server behavior

## Example: Shared-Only Mutator

Best for simple CRUD.

```ts
// zero/mutators/pages/rename.ts
export const rename = defineMutator(renamePageArgs, async ({ tx, args }) => {
  await tx.mutate.page.update({
    id: args.id,
    title: args.title,
  });
});
```

Behavior:

- optimistic on client
- same logic used on server
- no extra server code needed

## Example: Server-Only Authoritative Mutator

Best for permission-heavy or compound workflows where client optimism is either
dangerous or not worth mirroring fully.

```ts
// zero/mutators/checkout/finalize.ts
export const finalize = defineMutator(finalizeCheckoutArgs, async () => {
  // no client optimism by default
});
```

```ts
// zero/mutators/checkout/finalize.server.ts
export const finalizeServer = extendServerMutator(finalize, ({ args, ctx, tx, defer }) =>
  Effect.gen(function* () {
    const workflow = yield* FinalizeCheckoutWorkflow;
    const result = yield* workflow.execute({
      checkoutId: args.checkoutId,
      userId: ctx.userId,
    });

    for (const effect of result.afterCommit) {
      defer(effect);
    }
  }),
);
```

Behavior:

- client can still call `mutators.checkout.finalize(...)`
- no optimistic local write is required
- server override is fully responsible

## Example: Composed Server Override

Best for "simple local optimistic patch, richer authoritative workflow".

```ts
// zero/mutators/cart/add.ts
export const add = defineMutator(cartAddArgs, async ({ tx, args, ctx }) => {
  if (!ctx) throw new Error("Not authenticated");

  await tx.mutate.cartItem.insert({
    userId: ctx.userId,
    albumId: args.albumId,
    addedAt: tx.location === "client" ? args.addedAt : Date.now(),
    pending: tx.location === "client",
  });
});
```

```ts
// zero/mutators/cart/add.server.ts
export const addServer = extendServerMutator(add, ({ args, ctx, runDefaultMutation, defer }) =>
  Effect.gen(function* () {
    yield* runDefaultMutation();

    const workflow = yield* AddToCartWorkflow;
    const result = yield* workflow.execute({
      userId: ctx.userId,
      albumId: args.albumId,
    });

    for (const effect of result.afterCommit) {
      defer(effect);
    }
  }),
);
```

Behavior:

- client gets instant local patch from the base mutator
- server reuses the base mutation once
- server also runs richer Effect logic

## `runDefaultMutation()` Semantics

`runDefaultMutation()` is optional.

If the server override calls it:

- the base/shared mutator implementation runs once
- it runs authoritatively on the server transaction
- the override may add extra logic before or after it

If the server override does not call it:

- the override is fully responsible for the authoritative behavior

The helper should enforce:

- `runDefaultMutation()` may be called at most once
- calling it twice throws immediately

This avoids the easiest accidental double-apply bug.

Important clarification:

- a server override does not automatically run the base/shared mutator
- it only runs if the override explicitly calls `runDefaultMutation()`

## Double-Mutation Rules

These are the rules the API should make obvious.

### Safe

```ts
yield* runDefaultMutation()
yield* audit.record(...)
```

This does not double-apply the base mutation.

### Also safe

```ts
// do not call runDefaultMutation()
yield* workflow.execute(...)
```

This is a full replacement override.

### Unsafe

```ts
yield * runDefaultMutation();
yield * runDefaultMutation();
```

This must throw immediately.

### Still logically unsafe

```ts
yield* runDefaultMutation()
yield* manuallyRepeatSameInsert(...)
```

The helper cannot detect every semantic duplicate. It should only prevent the
easy accidental repeat of the default/shared path.

## Deferred Work And Post-Commit Behavior

The mutator helper should support post-commit work, but that does not need to
be a third top-level "phase" in the leaf API.

Instead:

- the server override gets `defer(effect)`
- the outer runner flushes deferred effects after the DB transaction commits

### Why not run deferred work inside the transaction?

Because that leads to the wrong semantics for most external effects:

- sending email before commit is unsafe
- firing webhooks before commit is unsafe
- transactions stay open too long if network work happens inside them

### Why not hide commit hooks in low-level data services?

Because that makes side effects too ambient and hard to reason about.

Preferred layering:

- low-level data/domain service
  DB logic only
- workflow/use-case service
  composes data services and returns `afterCommit` effects
- mutator override / API route
  runs the workflow and registers deferred work

## Workflow Result Shape

The clean pattern is to make the workflow explicit.

```ts
type WorkflowResult<A> = {
  readonly value: A;
  readonly afterCommit: ReadonlyArray<Effect.Effect<void>>;
};
```

Example:

```ts
const result = yield * workflow.execute(input);

for (const effect of result.afterCommit) {
  defer(effect);
}
```

This keeps commit-sensitive behavior explicit at the workflow layer rather than
hiding it in a low-level service.

## Desired v3 Example

For v3, the examples may use `Effect.Service` or `Context.Tag`-style services,
because that is the normal v3 service model.

Example workflow service:

```ts
import { Effect } from "effect";

export class AddToCartWorkflow extends Effect.Service<AddToCartWorkflow>()("AddToCartWorkflow", {
  effect: Effect.gen(function* () {
    const cart = yield* CartService;
    const summary = yield* CartSummaryService;
    const analytics = yield* AnalyticsService;

    return {
      execute: ({ userId, albumId }: { userId: string; albumId: string }) =>
        Effect.gen(function* () {
          yield* cart.ensureRowConsistency({ userId, albumId });
          yield* summary.recalculate(userId);

          return {
            value: undefined,
            afterCommit: [analytics.track("cart.added", { userId, albumId })],
          };
        }),
    };
  }),
}) {}
```

This matches the current v3 idiom used in many existing Effect v3 codebases.

## Desired v4 Example

For v4, do not use `Effect.Service`.

Per:

- `/Users/am/Coding/2026/effect-zero/.context/effect-v4-beta/MIGRATION.md`
- `/Users/am/Coding/2026/effect-zero/.context/effect-v4-beta/migration/services.md`

services move to `ServiceMap.Service`, and layers are built explicitly with
`Layer.effect(...)`.

Example workflow service:

```ts
import { Effect, Layer, ServiceMap } from "effect";

export class AddToCartWorkflow extends ServiceMap.Service<
  AddToCartWorkflow,
  {
    readonly execute: (input: { userId: string; albumId: string }) => Effect.Effect<{
      readonly value: void;
      readonly afterCommit: ReadonlyArray<Effect.Effect<void>>;
    }>;
  }
>()("AddToCartWorkflow", {
  make: Effect.gen(function* () {
    const cart = yield* CartService;
    const summary = yield* CartSummaryService;
    const analytics = yield* AnalyticsService;

    return {
      execute: ({ userId, albumId }) =>
        Effect.gen(function* () {
          yield* cart.ensureRowConsistency({ userId, albumId });
          yield* summary.recalculate(userId);

          return {
            value: undefined,
            afterCommit: [analytics.track("cart.added", { userId, albumId })],
          };
        }),
    };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide(CartService.layer),
    Layer.provide(CartSummaryService.layer),
    Layer.provide(AnalyticsService.layer),
  );
}
```

This is the desired v4 direction for the project.

## Relationship To Drizzle And Zero

Inside the server override:

- `tx`
  is the Zero `ServerTransaction`
- `tx.dbTransaction.query(...)`
  is the raw SQL bridge
- `tx.dbTransaction.wrappedTransaction`
  exposes native Drizzle APIs
- the override Effect runs in the same adapter-backed DB transaction

That means:

- direct wrapped Drizzle reads/writes
- raw SQL
- Effect workflow services

all participate in the same authoritative Zero transaction.

## Desired Runtime Flow

1. Client calls `zero.mutate(mutators.cart.add(args))`.

2. Client base/shared mutator runs optimistically if it has behavior.

3. Server route receives the push and uses the server registry.

4. If no override exists:
   the base/shared mutator runs authoritatively.

5. If an override exists:
   the override runs authoritatively.
   It may call `runDefaultMutation()` or replace it entirely.

6. Deferred effects collected via `defer(...)` are flushed only after the DB
   transaction commits successfully.

## What This Design Avoids

- manual `name: "cart.add"` strings
- one giant mutation spec object
- forcing every mutator into paired client/server implementations
- relying on bundle stripping magic for correctness
- ambient post-commit effects hidden in low-level data services by default

## What This Design Preserves

- native Zero registry naming
- natural feature/module code splitting
- default client-first Zero behavior
- optional server-first authoritative workflows
- clean Effect service reuse on the server
- explicit post-commit orchestration
