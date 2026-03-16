# Mutator API Options

This note captures the lessons from the Valterra implementation and turns them
into concrete API choices and test requirements for `effect-zero`.

Relevant Valterra files:

- `/Users/am/Coding/valterra-projects/valterra/packages/zero/src/server/adapter.ts`
- `/Users/am/Coding/valterra-projects/valterra/packages/zero/src/server/transaction.ts`
- `/Users/am/Coding/valterra-projects/valterra/packages/zero/src/server/processor.ts`
- `/Users/am/Coding/valterra-projects/valterra/packages/zero/src/server/mutator-with-effect.ts`
- `/Users/am/Coding/valterra-projects/valterra/packages/crm/src/zero/handler.ts`
- `/Users/am/Coding/valterra-projects/valterra/packages/crm/src/zero/define-crm-server-mutator.ts`
- `/Users/am/Coding/valterra-projects/valterra/packages/crm/src/zero/mutators.server.ts`
- `/Users/am/Coding/valterra-projects/valterra/packages/crm/src/zero/mutators/pages/pages.server.ts`
- `/Users/am/Coding/valterra-projects/valterra/packages/platform/src/db/effect/client.ts`
- `/Users/am/Coding/valterra-projects/valterra/packages/platform/src/db/effect/per-request.ts`

## What Valterra Gets Right

- One Effect service graph can be reused from API routes and Zero mutators.
- The app defines its own typed mutator helper once:
  `defineCrmServerMutator`.
- The adapter injects transactional Drizzle into the Effect layer so service
  code can run against the active transaction.
- The handler builds a request-scoped runtime instead of reusing unsafe global
  TCP state in worker paths.

That DX is strong. It is worth preserving.

## Where Valterra Diverges From Upstream Zero

- It uses a custom push processor in
  `/Users/am/Coding/valterra-projects/valterra/packages/zero/src/server/processor.ts`
  instead of staying on `handleMutateRequest(...)`.
- Its wrapped transaction surface is:
  `tx.dbTransaction.wrappedTransaction.drizzle` plus `runEffect(...)`.
- Upstream Drizzle parity is:
  `tx.dbTransaction.wrappedTransaction` itself exposes native Drizzle APIs.

That means Valterra's internal DX is reasonable, but it is not the same public
contract as Rocicorp's Drizzle adapter. If the goal is a reusable package,
matching the upstream contract is safer.

## Likely Bug Sources In The Valterra Pattern

- Transaction correctness depends on a custom processor and custom transaction
  bridge, not on Rocicorp's request pipeline.
- Mutator authors manually call
  `tx.dbTransaction.wrappedTransaction.runEffect(program)` in every server
  mutator. That is repetitive and easy to misuse.
- If any service accidentally resolves a non-transactional Drizzle instance,
  the logical mutator can partially escape the intended transaction boundary.
- Current tests mostly prove handler shape and basic adapter behavior. They do
  not fully prove transaction parity across direct Drizzle, Effect Drizzle, and
  Zero mutation execution.

## Recommended Direction

Keep the DX idea, simplify the execution model.

- Keep low-level adapter factories:
  - `createDbConnection()`
  - `createZeroDbProvider()`
- Keep a typed server mutator helper per lane:
  - `defineEffectServerMutatorV3(...)`
  - `defineEffectServerMutatorV4(...)`
- Keep service injection so one Effect service graph can be reused in routes and
  mutators.
- Prefer composing with `handleMutateRequest(...)` instead of replacing the push
  processor.
- Match upstream Drizzle adapter parity:
  - `tx.dbTransaction.query(...)`
  - `tx.dbTransaction.wrappedTransaction` exposes native Drizzle query APIs

## Do Not Split Everything

The bad DX is not "there is a server/client boundary". The bad DX is making
authors duplicate the full mutator definition in both places.

What should be split:

- browser-safe optimistic logic
- server-only Effect logic
- environment-specific registry assembly

What should stay shared:

- mutator name
- args validator
- return/result shape
- semantic operation identity
- test fixtures

That means the split belongs in package exports and implementation modules, not
in the conceptual mutator contract.

## Recommended Source Layout

For one logical mutator:

- `cart.shared.ts`
  shared contract only
- `cart.client.ts`
  optional optimistic/client implementation
- `cart.server.ts`
  optional server Effect implementation

The shared file defines the mutator contract once. Client and server attach only
their environment-specific behavior.

## Better DX Rule

Most mutators should not require both implementations.

Use three classes:

1. server-only custom mutator
   no optimistic client body, just a typed client caller plus a server handler
2. optimistic plus server mutator
   shared contract plus both implementations
3. local optimistic helper
   client-only behavior, never sent to the server

If we force every mutator into class 2, DX gets bad quickly.

## Recommended Package Exports

Each publishable package should expose:

- `@effect-zero/v3/shared`
- `@effect-zero/v3/client`
- `@effect-zero/v3/server`

and the same for v4.

Meaning:

- `shared`
  browser-safe contract builders and types only
- `client`
  browser-safe client mutator assembly helpers only
- `server`
  DBConnection, provider, server mutator helpers, and server-only types

Do not make the app import one catch-all root module if that root can drag
server-only Drizzle or DB code into the browser bundle.

## Recommended Authoring Model

Shared contract:

```ts
export const addToCart = defineMutatorContract({
  name: "cart.add",
  args: CartAddArgs,
});
```

Optional browser implementation:

```ts
export const addToCartClient = addToCart.client(({ tx, args }) => {
  tx.mutate.cart.push(args);
});
```

Optional server implementation:

```ts
export const addToCartServer = addToCart.server(({ args, ctx }) =>
  Effect.gen(function* () {
    const cart = yield* CartService;
    yield* cart.add(args);
  }),
);
```

Registry assembly:

```ts
export const clientMutators = createClientMutators([addToCartClient]);
export const serverMutators = createServerMutators([addToCartServer]);
```

This keeps the logical mutator single-sourced while preserving bundler safety.

## Practical Rule

Default to server-only custom mutators unless there is a clear optimistic UX
benefit.

That means the first implementation should support:

- one shared contract
- one typed client caller
- one server Effect handler

Only later should we add the optional optimistic client-body helper layer.

## API Options

### Option A

Thin typed wrapper over `defineMutatorWithType()`.

User shape:

```ts
export const addItem = defineEffectServerMutatorV3(Args, async ({ tx, args, ctx }) => {
  await tx.dbTransaction.runEffect(
    Effect.gen(function* () {
      const service = yield* CartService;
      yield* service.add(args);
    }),
  );
});
```

Pros:

- Closest to Valterra.
- Smallest implementation delta.
- Easy migration from existing manual `runEffect(...)` patterns.

Cons:

- Repetitive.
- Easy for users to split logical work across multiple transaction entry points.
- The transaction boundary stays too manual.

### Option B

Effect-first mutator helper where the handler itself returns an Effect.

User shape:

```ts
export const addItem = defineEffectServerMutatorV3(Args, ({ args, ctx }) =>
  Effect.gen(function* () {
    const service = yield* CartService;
    yield* service.add(args);
  }),
);
```

Library behavior:

- decode args
- open one Zero-backed transaction
- inject transactional Drizzle and services
- run the Effect
- commit or roll back once

Pros:

- Best default safety.
- Cleaner authoring model.
- Easier to test and explain.

Cons:

- Harder to expose raw transaction escape hatches ergonomically.
- More library design work.

### Option C

Hybrid surface.

- Default export is Option B.
- Advanced helper exposes the low-level transaction object for direct Drizzle or
  raw SQL escape hatches.

Recommended shape:

```ts
export const addItem = defineEffectServerMutatorV3(Args, ({ args }) =>
  Effect.gen(function* () {
    const service = yield* CartService;
    yield* service.add(args);
  }),
);

export const debugMutation = defineEffectServerMutatorV3.withTransaction(Args, ({ tx, args }) =>
  Effect.gen(function* () {
    yield* tx.query("select 1", []);
    const rows = yield* tx.wrappedTransaction.select().from(items);
    const service = yield* CartService;
    yield* service.reconcile(args, rows);
  }),
);
```

This is the recommended direction for `effect-zero`.

## Transaction Parity Test Matrix

The goal is not just "mutators pass". The goal is to prove that the same
business logic behaves the same across all layers.

Lanes:

- plain Drizzle Promise
- Drizzle Effect v3
- Drizzle Effect v4
- Zero Promise control
- Zero Effect v3
- Zero Effect v4

Every lane should prove:

1. Commit success
   One write commits and is visible after the transaction completes.
2. Rollback on thrown error
   A write followed by an exception leaves no persisted change.
3. Rollback on failed Effect
   A write followed by `Effect.fail(...)` leaves no persisted change.
4. Raw SQL in transaction
   `tx.dbTransaction.query(...)` sees the same uncommitted rows as the native
   transaction object.
5. Wrapped native Drizzle access
   `tx.dbTransaction.wrappedTransaction` can perform native Drizzle reads and
   writes.
6. Service-backed transaction participation
   An Effect service read after an in-transaction write sees the uncommitted
   row.
7. Service rollback
   A service write followed by failure does not commit.
8. Batch ordering
   Two or more Zero mutations from one client preserve LMID ordering and final
   state.
9. Duplicate mutation handling
   Replaying the same mutation ID does not apply the write twice.
10. Out-of-order mutation handling
    A gap in mutation IDs produces the expected Zero error and does not corrupt
    state.
11. Concurrent same-client burst
    A small burst from one client converges to the same final state as serial
    application.
12. Concurrent multi-client overlap
    Two clients mutating overlapping rows converge correctly.

## What To Benchmark

Measure correctness first, then performance.

Correctness-critical timings:

- single mutation latency
- 10 serial mutations
- 100 serial mutations
- 10 parallel mutations
- read after write latency
- client convergence lag once Zero replication is in the loop

Separate metrics:

- direct transaction latency
- `handleMutateRequest(...)` latency
- `zql.run(...)` read latency
- `handleQueryRequest(...)` transform latency

Do not treat `handleQueryRequest(...)` as an adapter benchmark. It is mainly
query-to-AST/response transformation work.

## Concrete Next Step

Implement the hybrid API first in v3.

- Start with a red test for an Effect-returning server mutator that uses a
  service and commits one write.
- Add a red test for rollback on failed Effect.
- Add a red test proving the same mutator can call raw SQL and native Drizzle
  in the same transaction.
- After v3 is stable, mirror the same surface in v4.
