# Mutation Core Refactor Plan

This document scopes the next refactor of `effect-zero` so the package can
carry more of the reusable mutation complexity that currently lives in
application repos.

The immediate trigger is the gap between:

- the current package surface, which is optimized for apps that stay on
  `handleMutateRequest(...)`
- one private production mutate path, which needs:
  - non-blocking post-commit scheduling
  - request-scoped Effect execution
  - custom route-level error mapping
  - request-level logging and metrics

The goal is not to copy one app's full custom mutate route into this repo.
The goal is to extract the reusable mutation execution core so multiple apps
can share it while still keeping their own HTTP shell and app-specific route
contracts.

This refactor should be approached as if request-scoped Effect execution and
post-commit handoff had been first-class assumptions from the start. For each
proposed change, the repo should inspect the existing execution path, strip away
transport-specific incidental complexity, and keep only the smallest design
that would have felt natural if the package had started with one mutation core
and thin wrappers around it.

Related docs:

- `/Users/am/Coding/2026/effect-zero/docs/ACCEPTANCE_CRITERIA.md`
- `/Users/am/Coding/2026/effect-zero/docs/DESIRED_MUTATOR_API.md`
- `/Users/am/Coding/2026/effect-zero/docs/MUTATOR_API_OPTIONS.md`
- `/Users/am/Coding/2026/effect-zero/docs/EFFECT_ZERO_COMPARISON.md`

## Problem Statement

Today the publishable packages expose a useful but narrow surface:

- `extendServerMutator(...)`
- `createServerMutatorHandler(...)`
- `createRestMutatorHandler(...)`
- adapter factories

That is enough for apps that:

- use Zero's stock request pipeline
- are fine with deferred work being awaited before the handler returns
- do not need a custom route-level response contract

That is not enough for apps that need a different shell around mutation
execution.

That should influence the extension points, but it should not redefine the
default path for the package. The package should offer the best default path
forward, and apps that currently have a more custom shell should refactor
toward it where practical.

The default path should stay:

- `handleMutateRequest(...)`
- one transaction per logical mutation
- `extendServerMutator(...)` for authoritative server work
- explicit post-commit scheduler selection
- adapter factories that preserve the current owned and caller-owned modes

If `effect-zero` wants to reduce maintenance burden across multiple apps, the
package needs to own more of the reusable core and less of the app-specific
HTTP behavior, while still making the default path the recommended one.

## Refactor Goals

1. Keep the simple `handleMutateRequest(...)` path working for apps that want it.
2. Extract a lower-level mutation execution primitive that does not depend on
   `handleMutateRequest(...)`.
3. Make post-commit behavior pluggable so apps can choose inline, `waitUntil`,
   queue, or workflow scheduling without rewriting mutator execution.
4. Keep the current mutator authoring API small and close to native Zero.
5. Align package dependency boundaries so multiple apps can consume the package
   without duplicate `@rocicorp/zero` or `effect` copies.
6. Preserve request and transaction correctness under replay, out-of-order
   mutation handling, and rollback.
7. Preserve adapter compatibility across:
   - `postgres.js`
   - `node-pg`
   - Drizzle
   - caller-owned client injection
   - owned helper-managed client creation
8. Prefer foundational simplification over additive helpers: when a new
   behavior can be expressed by strengthening the shared mutation core and
   keeping wrappers thin, do that instead of growing a parallel surface.

## Non-Goals

- Reimplement an app's entire custom push processor in this repo.
- Add a query abstraction layer on top of Zero.
- Invent a second mutator authoring model unrelated to
  `extendServerMutator(...)`.
- Require every app to expose the same route-level error contract.

## Recommended Default Path

This is the path the package should optimize for and document first.

1. Choose one adapter:
   - `postgresjs`
   - `pg`
   - `drizzle`
2. Use either:
   - owned mode via connection string
   - caller-owned mode via injected client or DB instance
3. Keep using `handleMutateRequest(...)`.
4. Use `extendServerMutator(...)` when server-only Effect logic is needed.
5. Choose one scheduler:
   - inline for tests and deterministic local flows
   - `waitUntil(...)` for Cloudflare and similar worker runtimes
   - caller-provided callback adapter for queues or workflows
6. Use `createMutationExecutor(...)` only when an app truly needs a custom
   request shell.

This means advanced extension points should exist, but the docs and examples
should still push consumers toward the stock Zero route path first.

## Adapter Compatibility Invariants

This refactor must not regress the adapter surface.

For both v3 and v4, all of the following must remain true:

- `server/adapters/postgresjs` still supports:
  - owned mode from connection string
  - caller-owned mode from injected `postgres` client
- `server/adapters/pg` still supports:
  - owned mode from connection string
  - caller-owned mode from injected `pg` pool or client
- `server/adapters/drizzle` still supports:
  - owned mode from connection string plus `drizzleSchema` and `zeroSchema`
  - caller-owned mode from injected DB instance
- `provider.dispose()` semantics stay unchanged:
  - real dispose for owned mode
  - no-op for caller-owned mode
- `tx.dbTransaction.query(...)` continues to work
- `tx.dbTransaction.wrappedTransaction` continues to expose the native adapter
  structure expected by that lane

This refactor is about mutation execution and scheduling. It is not license to
break the existing adapter structure or force consumers onto helper-managed
clients.

## Architectural Direction

The package should be split conceptually into two layers.

### 1. Mutation Core

This is the reusable execution layer.

Responsibilities:

- resolve app context for a mutation
- execute the chosen mutator inside exactly one transaction
- provide Effect execution for overrides
- collect deferred post-commit work
- hand deferred work to a pluggable scheduler after commit

This layer should be usable by:

- `handleMutateRequest(...)`
- a REST route
- a custom Zero push processor
- direct tests and harnesses

### 2. Route Wrappers

These are convenience adapters.

Responsibilities:

- adapt the mutation core to Zero's `handleMutateRequest(...)` callback shape
- adapt the same core to a plain REST path

These wrappers should stay thin and be built on the same shared primitive.

## Proposed Package Surface

Keep the current exports, but change how they are implemented internally.

### Public server exports

| Export                                    | Role                                                          | When to use it                                                                   |
| ----------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `extendServerMutator(...)`                | Author server-only logic around a normal Zero mutator.        | Default way to add Effect logic, external checks, and deferred post-commit work. |
| `createServerMutatorHandler(...)`         | Thin Zero transport wrapper over the shared executor.         | Default path when staying on `handleMutateRequest(...)`.                         |
| `createRestMutatorHandler(...)`           | Thin REST transport wrapper over the shared executor.         | Use when exposing the same mutation core through a plain route.                  |
| `createMutationExecutor(...)`             | Reusable mutation execution primitive.                        | Advanced path for custom push shells, harnesses, or direct tests.                |
| `createInlinePostCommitScheduler(...)`    | Inline `await` scheduler.                                     | Default for tests and simple server runtimes.                                    |
| `createWaitUntilPostCommitScheduler(...)` | `waitUntil(...)` handoff scheduler.                           | Cloudflare-style runtimes that should return before deferred work settles.       |
| `type PostCommitScheduler`                | Scheduler contract used by the executor and helper factories. | Use when wiring queues, workflows, or custom background delivery.                |

The surface should still collapse conceptually to two primitives:

- authoring primitive: `extendServerMutator(...)`
- execution primitive: `createMutationExecutor(...)`

Everything else is a thin convenience wrapper over one of those primitives and
should stay behaviorally small. If a future change needs more power, the first
question should be whether the shared executor or scheduler contract should
grow, not whether another top-level helper should be added.

### API parameter summary

- `extendServerMutator(baseMutator, override)`
  - `baseMutator`: the existing Zero mutator definition and validator source of
    truth.
  - `override`: server-only logic that receives
    `{ args, ctx, tx, runDefaultMutation, defer }`.
- `createServerMutatorHandler(options)` / `createRestMutatorHandler(options)`
  - `options.mutators`: the registered mutator table.
  - `options.getContext(mutation)`: resolves request-scoped app context once
    per logical mutation.
  - `options.executeEffect(input)`: optional request-aware Effect runner.
  - `options.postCommitScheduler(task)`: optional post-commit handoff
    strategy; defaults to inline.
- `createMutationExecutor(options)`
  - takes the same `options` shape as the wrappers, but returns the executor
    directly so custom shells can own transport, logging, and response mapping.
- `createInlinePostCommitScheduler()`
  - no special inputs; preserves today's "await deferred work after commit"
    behavior.
- `createWaitUntilPostCommitScheduler({ waitUntil, onDeferredError })`
  - `waitUntil`: runtime handoff hook.
  - `onDeferredError`: required visibility hook for failures that happen after
    the response is committed.

## Proposed Core API

```ts
type PostCommitTask<TContext> = {
  readonly ctx: TContext;
  readonly effect: Effect.Effect<unknown, unknown, unknown>;
  readonly mutation: ServerMutationLike;
};

type PostCommitScheduler<TContext> = (task: PostCommitTask<TContext>) => Promise<void>;

type ExecuteEffectInput<TContext, TSchema, TWrappedTransaction, A, E, R> = {
  readonly ctx: TContext;
  readonly effect: Effect.Effect<A, E, R>;
  readonly mutation: ServerMutationLike;
  readonly tx?: ServerTransaction<TSchema, TWrappedTransaction>;
};

interface CreateMutationExecutorOptions<TMutators, TSchema, TContext, TWrappedTransaction> {
  readonly mutators: TMutators;
  readonly getContext: (mutation: ServerMutationLike) => Promise<TContext> | TContext;
  readonly executeEffect?: <A, E, R>(
    input: ExecuteEffectInput<TContext, TSchema, TWrappedTransaction, A, E, R>,
  ) => Promise<A>;
  readonly postCommitScheduler?: PostCommitScheduler<TContext>;
}
```

### Core API parameter roles

- `mutators`: the same mutator table the wrappers already receive today; there
  is no second registration model.
- `getContext(mutation)`: called once before the transaction begins so the
  core can stay transport-agnostic while still getting request-scoped auth,
  services, and metadata.
- `executeEffect(input)`: app-owned bridge from package Effect values to the
  app's runtime, layers, tracing, and error mapping.
- `postCommitScheduler(task)`: post-commit handoff contract. It receives one
  named task object so the scheduler API stays readable and easy to extend.

Core behavior:

1. Resolve context.
2. Open exactly one transaction through the caller-provided transaction host.
3. Run the server mutator override or default mutator.
4. Collect deferred effects during that execution.
5. After a successful commit, hand each deferred effect to the scheduler.
6. Return the transaction response immediately after scheduling completes.

Important detail:

- "scheduling completes" means the scheduler accepted responsibility for the
  work.
- It does not mean the deferred effect itself must finish before the route
  returns.
- The scheduler payload intentionally excludes the transaction object.
  Post-commit work should be expressed in terms of request context plus the
  deferred effect, not by reusing a committed transaction handle.

## Post-Commit Scheduler Design

This is the main refactor driver.

Today deferred effects are effectively:

- collected during the transaction
- awaited inline after commit

That keeps implementation simple but makes the package unsuitable for apps that
need non-blocking post-commit behavior.

The refactor should replace that with an explicit scheduler contract that
schedules a named `PostCommitTask` object rather than a positional
`(effect, context)` pair.

### Required scheduler behaviors

1. Inline scheduler
   - current behavior
   - run deferred effects immediately and await completion
   - useful for tests and simple Node apps

2. `waitUntil(...)` scheduler
   - wrap each deferred effect in `waitUntil(Promise)`
   - resolve immediately after the task is handed off
   - log or callback on scheduler-level failures

3. Queue/workflow scheduler
   - future-facing
   - enqueue a serialized job or dispatch to an external workflow runtime

### Required scheduler rules

- Schedulers run only after the DB transaction commits.
- Scheduling failure should be visible to the caller.
- Deferred effect failure should be configurable:
  - inline scheduler may fail the request after commit
  - background schedulers should surface the failure to logging/hooks, not to
    the already-committed mutation response

That distinction must be documented clearly because it affects app semantics.

## Wrapper Refactor

`createServerMutatorHandler(...)` and `createRestMutatorHandler(...)` should be
thin wrappers over `createMutationExecutor(...)`.

### Before

- wrappers own the full execution algorithm
- wrappers own deferred effect draining
- wrappers are the only public execution entrypoints

### After

- wrappers only translate their transport shape into the core executor shape
- deferred effect handling lives in the core executor
- apps with custom Zero push processors can use the same core directly

This keeps the common docs short while finally giving advanced apps a stable
reuse point.

## External Systems And File/Object Storage

Object stores such as S3 or R2 are the main example of work that cannot be
made part of the Postgres transaction.

Important constraint:

- `effect-zero` can guarantee the DB transaction boundary
- it cannot create a true distributed transaction across Postgres and object
  storage

Because of that, the best default path should be:

1. treat object storage as an external system
2. avoid pretending the DB commit and object-store write are atomic
3. document safe patterns for staged writes and cleanup

### Recommended file-browser pattern

For uploads:

1. create or reserve a temporary object key
2. upload or verify the object outside the Zero DB transaction
3. run the Zero mutation only after the object exists
4. commit DB metadata that points at the verified object
5. clean up abandoned temporary objects with a background reaper if the DB
   mutation later fails

For rename or move:

1. copy or create the new object key first
2. verify the new object exists
3. commit the DB pointer update
4. schedule deletion of the old object after commit

For delete:

1. mark the DB record pending deletion or soft-deleted
2. delete the object in background
3. finalize the DB state after the external delete succeeds, or record failure

This is usually safer than trying to do "DB change first, storage second" or
"storage first, DB second" with no cleanup strategy.

### What `effect-zero` should allow

The package should allow consumers to run external I/O before
`runDefaultMutation()` or instead of `runDefaultMutation()`.

That is already compatible with the current `extendServerMutator(...)` shape:

- do external verification first
- only call `runDefaultMutation()` if the external precondition succeeds
- use deferred post-commit scheduling only for work that is safe after commit

The package should document this pattern, but it should not try to hide the
fact that compensating cleanup is still needed for external systems.

### High-level file upload pseudocode

```ts
class UploadedObjectNotFound extends Schema.TaggedError<UploadedObjectNotFound>()(
  "UploadedObjectNotFound",
  { tempKey: Schema.String },
) {}

export const finalizeUploadServer = extendServerMutator(
  finalizeUpload,
  ({ args, runDefaultMutation, defer }) =>
    Effect.gen(function* () {
      const storage = yield* ObjectStorage;

      const exists = yield* storage.verifyObject(args.tempKey);
      if (!exists) {
        return yield* Effect.fail(new UploadedObjectNotFound({ tempKey: args.tempKey }));
      }

      yield* runDefaultMutation();

      defer(storage.enqueueTempCleanup(args.tempKey));
    }),
);
```

Examples in this repo should prefer tagged Effect errors over `new Error(...)`
so app-local route mappers can branch on `_tag` values instead of string
messages.

That is the level of abstraction the package should support. The package should
not try to promise atomic storage + DB commits.

## Dependency Boundary Changes

The publishable packages should stop hard-owning `@rocicorp/zero` and `effect`
as ordinary runtime dependencies.

Recommended direction:

- move `@rocicorp/zero` to `peerDependencies` with a `>=0.26.0 <1` range
- move the matching canonical Effect runtime for each package line to
  `peerDependencies`
- keep only true implementation-time dependencies as package dependencies
- keep adapter-specific drivers optional peers

Reason:

- multiple apps will already pin their own `@rocicorp/zero` and Effect runtime
- duplicate copies increase the risk of runtime incompatibility
- this becomes more important once the package is used deeper in the app's
  request lifecycle

### Default install story vs. advanced migration setups

Docs should optimize for the common case:

- one app chooses one `effect-zero` package line
- the app installs the matching canonical Effect runtime peer for that line
- the app installs Zero `0.26+`

Advanced side-by-side migration setups that alias a second Effect line as
`effect-v4`, `effect-beta`, or similar can stay app-local. That is a valid
escape hatch during migration, but it should only appear as a short advanced
note instead of shaping the main install contract. The package itself should
peer on canonical published package names, not on app-local aliases.

The verification matrix must include a fresh install check to make sure the new
peer model is actually consumable.

## What Stays App-Local

The following should remain outside the reusable package:

- auth/session lookup
- request-to-context mapping beyond the `getContext(...)` hook
- route-level response shaping
- app-specific logging fields and metrics dimensions
- app-specific error envelopes such as a private app's custom push error payload

This is deliberate. The package should own mutation execution, not app HTTP
identity.

## Implementation Plan

### Phase 1. Introduce scheduler abstraction without changing default behavior

Scope:

- add `PostCommitScheduler` types
- add inline scheduler implementation
- make current wrappers delegate deferred effects to the inline scheduler

Acceptance criteria:

- no public behavior change
- existing v3 and v4 tests stay green
- inline scheduling remains the documented default

Tests:

- existing wrapper tests still pass unchanged
- new inline scheduler test proves current await semantics are preserved

High-level pseudocode:

```ts
const scheduler = options.postCommitScheduler ?? createInlinePostCommitScheduler();
for (const effect of deferredEffects) {
  await scheduler({
    ctx,
    effect,
    mutation: input.mutation,
  });
}
```

### Phase 2. Introduce `createMutationExecutor(...)`

Scope:

- lift the current internal `executeServerMutation(...)` algorithm into the
  public executor instead of inventing a parallel second core
- extract shared execution algorithm from both wrapper helpers
- keep wrappers as thin adapters over the new primitive

Acceptance criteria:

- wrappers remain behaviorally identical
- executor has direct tests independent of Zero route wrappers

Tests:

- executor success path
- executor composed override path
- executor replacement override path
- executor rollback path

High-level pseudocode:

```ts
const executeMutation = createMutationExecutor(options);

return runTransportWrapper((transactionHost, mutation) =>
  executeMutation({
    transactionHost,
    mutation,
  }),
);
```

### Phase 3. Add non-blocking scheduler support

Scope:

- add `createWaitUntilPostCommitScheduler(...)`
- support "fire-and-forget after successful scheduling handoff"
- add scheduler callbacks or logger hooks for background failures

Acceptance criteria:

- one test proves the route returns before deferred work settles
- one test proves deferred work still only starts after commit
- one test proves scheduling failure is surfaced distinctly from effect failure
- Cloudflare-style `waitUntil(...)` support exists
- Node callers can inject their own scheduler without route rewrites

Tests:

- `waitUntil` scheduler acceptance test
- custom scheduler callback acceptance test
- deferred work not run on rollback
- deferred error hook coverage

High-level pseudocode:

```ts
const scheduler = createWaitUntilPostCommitScheduler({
  waitUntil,
  onDeferredError,
});

await scheduler({
  ctx,
  effect,
  mutation,
}); // resolves after handoff, not after effect completion
```

### Phase 4. Validate custom-processor consumption

Scope:

- add a harness test using `createMutationExecutor(...)` outside
  `handleMutateRequest(...)`
- mirror the minimum shape needed by an app with a custom push shell:
  - custom route shell
  - custom error mapping
  - request-scoped effect execution

Acceptance criteria:

- package proves it can support both stock Zero and custom shells

Tests:

- direct executor harness test outside `handleMutateRequest(...)`
- request-context propagation test
- route-level error mapping remains app-owned

High-level pseudocode:

```ts
const executor = createMutationExecutor(options);
const result = await executor({
  transactionHost,
  mutation,
});
return mapResultToRouteResponse(result);
```

### Phase 5. Tighten publish surface

Scope:

- move `@rocicorp/zero` to peers with a `>=0.26.0 <1` range
- move the canonical Effect runtime dependency for each package line to peers
- verify v3 and v4 package manifests
- update READMEs and installation docs, with dual-version aliasing documented
  only as an advanced migration note

Acceptance criteria:

- package install docs match published dependency expectations
- Zero peer expectations are explicitly `0.26+`
- main install docs stay simple for the common single-Effect-line case
- verification includes clean install coverage
- v3 and v4 adapter README examples still work for:
  - `postgresjs`
  - `pg`
  - `drizzle`
  - caller-owned clients

Tests:

- package manifest snapshots
- fresh install verification against the supported Zero peer range
- adapter smoke tests for owned and caller-owned modes

High-level pseudocode:

```ts
peerDependencies: {
  "@rocicorp/zero": ">=0.26.0 <1",
  effect: "<matching runtime range for this package line>",
}
```

If the v4 line is still consuming a beta runtime under a different canonical
published package name at release time, peer on that canonical package name
rather than on any app-local alias.

## Test Plan Additions

The following gaps should be closed during this refactor.

### Core executor tests

- success path with no deferred work
- success path with deferred work
- replacement override without `runDefaultMutation()`
- composed override with `runDefaultMutation()`
- failure when `runDefaultMutation()` is called more than once
- effect execution receives request context and transaction

### Scheduler tests

- inline scheduler awaits deferred work
- `waitUntil` scheduler does not await deferred completion
- deferred effects do not run on rollback
- scheduler handoff failure is surfaced immediately
- deferred effect failure after scheduling is reported to hook/logger

### Wrapper parity tests

- `createServerMutatorHandler(...)` still works with `handleMutateRequest(...)`
- `createRestMutatorHandler(...)` still works for direct route invocation
- duplicate replay and out-of-order semantics remain unchanged

### Install/package tests

- package manifest snapshot for v3 and v4
- peer dependency expectations documented and enforced
- browser-safe entrypoint verification still passes

## Recommended Decisions

1. `createMutationExecutor(...)` should be public immediately, but documented as
   an advanced server export.
2. The refactor should promote the existing shared execution algorithm into that
   core instead of layering a second parallel mutation pipeline beside it.
3. The scheduler contract should use one named `PostCommitTask` object that
   carries `{ ctx, effect, mutation }`.
4. Non-inline scheduler helpers should take an explicit
   `onDeferredError(...)` callback or logger hook so background failures never
   disappear silently.
5. The scheduler interface should be shared across v3 and v4. Helper factories
   can stay versioned only for import-path consistency.
6. The repo should implement inline and `waitUntil(...)` schedulers now and
   document queue/workflow adapters for later. A built-in queue runtime is not
   an immediate requirement.
7. Default install docs should target Zero `0.26+` and one canonical Effect
   runtime per app; dual-version aliasing should only get a short advanced
   migration note.

## Success Criteria For This Refactor

This refactor is successful when all of the following are true:

- simple apps can keep using `createServerMutatorHandler(...)` with no extra
  conceptual load
- advanced apps can reuse the mutation core without adopting the stock route
  shell
- deferred post-commit work is pluggable and can be non-blocking
- package dependencies are safe for multi-app consumption
- the v3 and v4 lines still share the same server adapter API shape

At that point `effect-zero` will be carrying the reusable mutation complexity
that currently has to be reimplemented in app repos, while leaving app-specific
HTTP contracts where they belong.
