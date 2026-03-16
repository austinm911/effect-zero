# Realms Labs `effect-zero` Comparison

This note compares the external `realms-labs/effect-zero` package with the implementation in this repo.

Reference repo:

- `https://github.com/realms-labs/effect-zero`

## What `realms-labs/effect-zero` Is

It is primarily a higher-level Effect-oriented mutator and query authoring layer on top of Zero.

It is not primarily a custom Zero `DBConnection` adapter package.

The core shape is:

- define mutator argument schemas with `effect-zero/mutators`
- define Effect-returning mutator functions with `Mutators.make(...)`
- create a server transaction service with `ServerTransaction.make(...)`
- run mutator code through `Server.processPush(...)`
- keep using an existing Zero adapter underneath, typically `zeroPostgresJS(...)` or `zeroDrizzle(...)`

In other words:

- `realms-labs/effect-zero` solves authoring ergonomics for Zero mutators and queries in Effect
- this repo solves adapter/runtime integration for Zero `DBConnection` with:
  - Promise control
  - Effect v3
  - Effect v4

Those are adjacent problems, not the same problem.

## What This Repo Already Has

This repo already provides the low-level adapter layer:

- `packages/effect-zero-v3`
  real `DBConnection` and `ZQLDatabase` bridge on Drizzle Effect Postgres v3
- `packages/effect-zero-v4`
  real `DBConnection` and `ZQLDatabase` bridge on pinned Drizzle beta + Effect v4
- `examples/api`
  request-level verification and benchmark harness for the full target matrix
- `examples/ztunes`
  browser-facing smoke surface for the control and Drizzle Effect targets

The current gap is not the adapter itself.

The current gap is the higher-level mutator authoring API for backend logic:

- Effect service injection
- one clear transaction boundary
- runtime-specific execution
- reusable typed mutator definitions

## Key Differences

## 1. Transaction ownership

`realms-labs/effect-zero` requires user code to explicitly opt into the server transaction by calling helpers like:

- `serverTransaction.use(...)`
- `.pipe(serverTransaction.execute)`

This makes transaction boundaries visible, but it also changes semantics compared to standard Zero mutation processing.

Their own README explicitly documents these edge cases:

- code after the committed transaction can fail and the push still resolves successfully
- multiple transactions can run in one logical mutator
- zero transactions is treated as an error

That is a useful experiment, but it is not the safest default for our publishable adapter packages.

For this repo, the better default is:

- one push mutation
- one adapter-backed transaction
- the whole server mutator body runs inside that transaction
- the user should not need to remember where to call `execute`

## 2. Adapter strategy

`realms-labs/effect-zero` continues to rely on an existing Zero adapter under the hood.

This repo intentionally replaces that lower layer for v3 and v4:

- v3: custom Zero `DBConnection` via Drizzle Effect Postgres
- v4: custom Zero `DBConnection` via pinned Drizzle beta + Effect v4

So their package is complementary to ours, not a substitute for it.

## 3. Service model

`realms-labs/effect-zero` has the right instinct around Effect-native authoring:

- mutators are `Effect`
- requirements propagate through the mutator tree
- service dependencies can be inferred through the mutator definitions

That is the main lesson worth carrying over.

## 4. Query API

They also provide a query definition and streaming API.

For this repo, that is lower priority than mutator authoring because:

- Zero already has strong query primitives
- our current higher-risk area is mutation correctness under concurrency and target-specific runtime behavior

## Decision

We should add a mutator API surface for both v3 and v4.

But we should not copy the Realms Labs transaction model as-is.

Recommended design:

- keep `createDbConnection(...)` and `createZeroDbProvider(...)` as the low-level publishable adapter API
- add a higher-level mutator helper layer in each package
- make the helper Effect-native and service-friendly
- automatically wrap the mutator body in exactly one transaction
- expose `wrappedTransaction` and raw SQL through the existing Zero/Drizzle transaction surface
- discourage or prevent multiple separate transaction commits inside one mutator

## Recommended Package Shape

For each runtime line:

- `createDbConnection(...)`
- `createZeroDbProvider(...)`
- `createServerMutator(...)`
- `createServerMutators(...)`
- `runServerMutation(...)`

The mutator helper should:

- accept a validator/schema
- accept an Effect handler
- inject:
  - decoded args
  - Zero transaction
  - target-specific services
  - app context
- execute the handler inside one adapter-backed transaction

The most important ergonomic target is:

- users can define backend logic with Effect services
- users do not need to manually call transaction entry helpers inside every mutator

## What To Reuse from `realms-labs/effect-zero`

- typed mutator schema tree
- mutator requirement propagation through the Effect environment
- explicit tests for mutation error timing
- explicit tests for batched mutations and out-of-order mutation handling

## What Not To Reuse as Default Behavior

- user-managed transaction wrapping inside mutator bodies
- successful push after post-commit failure as the primary authoring model
- more than one committed transaction per logical Zero mutation

## Acceptance Impact

This repo is not done until both v3 and v4 have:

- low-level adapter coverage
- high-level mutator authoring helpers
- tests proving service-backed mutators run correctly through `handleMutateRequest(...)`
