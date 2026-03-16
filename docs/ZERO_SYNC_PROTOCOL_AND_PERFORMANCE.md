# Zero Sync Protocol And Performance

As of March 14, 2026, this is the working model this repo should use for Zero behavior, adapter correctness, and performance testing.

This file exists to answer two questions:

- how Zero actually moves data from client to Postgres to `zero-cache` to clients
- what we should test if a custom adapter behaves badly under multiple mutations

## Core Model

Zero is a sync engine. The client reads and writes its local store first, and synchronization happens in the background.

For this repo, the important split is:

- `POST /api/zero/mutate`
  Server-side mutation execution. This is adapter-sensitive.
- `zql.run(...)`
  Server-side query execution against the adapter-backed database. This is adapter-sensitive.
- `POST /api/zero/query`
  Query-name to AST transformation. This is not adapter-sensitive.

That last point matters a lot:

- `handleQueryRequest(...)` does not run the query against your database.
- It resolves a query name plus args into ZQL, maps it to a Zero AST, and returns that AST to `zero-cache`.
- If your custom adapter is broken, `POST /api/zero/query` can still look fast and healthy.

So for adapter validation, the primary paths are:

- mutation execution through `handleMutateRequest(...)`
- server reads through `ZQLDatabase.run(...)`
- raw SQL through `tx.dbTransaction.query(...)`
- native driver access through `tx.dbTransaction.wrappedTransaction`

## End-To-End Flow

### Query Flow

From the official Zero docs:

- A query first runs on the client against the client-side datastore.
- In the background, the query name and args are sent to `zero-cache`.
- `zero-cache` calls your query endpoint to resolve that query into server-side ZQL / AST.
- `zero-cache` runs that query against its server-side SQLite replica.
- The authoritative result is sent back to the client.
- Later Postgres changes arrive via logical replication, and `zero-cache` pushes diffs to clients.

For this repo, the effective query pipeline is:

1. client query runs locally
2. `zero-cache` asks `/api/zero/query` for AST
3. `zero-cache` runs AST against the SQLite replica
4. replica updates are pushed to clients as the upstream Postgres WAL advances

Relevant upstream and local files:

- [process-queries.ts](/Users/am/Coding/2026/effect-zero/.context/rocicorp-mono/packages/zero-server/src/queries/process-queries.ts)
- [queries.ts](/Users/am/Coding/2026/effect-zero/examples/ztunes/app/zero/queries.ts)
- [server.ts](/Users/am/Coding/2026/effect-zero/examples/ztunes/app/server/control.ts)

### Mutation Flow

From the official Zero docs:

- A mutator runs first on the client against the client-side datastore.
- The optimistic result updates open queries immediately.
- In the background, the mutation is pushed to the server-side mutate flow.
- The server executes the mutator in a database transaction and records that it ran.
- Postgres changes are then replicated to `zero-cache`.
- `zero-cache` computes affected query diffs and sends row updates plus mutation acknowledgements to clients.
- Clients roll back pending optimistic effects once the server-applied mutation is observed.

In the upstream server code, `handleMutateRequest(...)` processes mutations sequentially and, for each mutation:

1. opens a database transaction
2. increments / checks `lastMutationID`
3. runs the mutator body
4. persists failure results when needed
5. commits

Important LMID behavior from upstream:

- if `receivedMutationID < lastMutationID`, Zero treats it as already processed
- if `receivedMutationID > lastMutationID`, Zero treats it as out-of-order
- if they match, the mutation is allowed to run

Relevant upstream and local files:

- [process-mutations.ts](/Users/am/Coding/2026/effect-zero/.context/rocicorp-mono/packages/zero-server/src/process-mutations.ts)
- [zql-database.ts](/Users/am/Coding/2026/effect-zero/.context/rocicorp-mono/packages/zero-server/src/zql-database.ts)
- [server.ts](/Users/am/Coding/2026/effect-zero/examples/api/src/server.ts)
- [index.ts](/Users/am/Coding/2026/effect-zero/packages/effect-zero-v3/src/index.ts)
- [index.ts](/Users/am/Coding/2026/effect-zero/packages/effect-zero-v4/src/index.ts)

## Where WAL And SQLite Fit

Zero uses Postgres logical replication. `zero-cache` continuously replicates upstream Postgres into a SQLite replica.

The query-serving path is therefore:

1. write commits in Postgres
2. Postgres WAL is consumed by `zero-cache`
3. `zero-cache` advances its SQLite replica
4. active query pipelines are updated
5. row diffs are sent to clients

So yes, the rough mental model is:

- Postgres is the source of truth
- `zero-cache` tracks the upstream WAL
- `zero-cache` serves queries from its SQLite replica
- clients sync against Zero, not directly against Postgres

But there is one important nuance:

- server-side custom mutator execution happens against Postgres, not the SQLite replica
- server-side query transform happens at your app server
- query hydration and incremental query maintenance happen inside `zero-cache` against SQLite

## What A Custom Adapter Must Actually Preserve

For our v3/v4 packages, the required compatibility surface is the upstream Drizzle adapter shape:

- `tx.dbTransaction.query(...)` must execute raw SQL correctly inside the same mutation transaction
- `tx.dbTransaction.wrappedTransaction` must still expose native Drizzle query APIs
- `ZQLDatabase.transaction(...)` must work with Zero's LMID and mutation-result hooks
- `ZQLDatabase.run(...)` must support server-side ZQL reads correctly

If a custom Effect adapter fails under multiple mutations, the likely failure points are:

- broken transaction reuse or transaction scoping
- `query(...)` not reading against the same transaction that the mutator is writing in
- `wrappedTransaction` not being the actual live Drizzle transaction
- request-scoped runtime/client lifecycle bugs
- LMID writes happening out of order or outside the intended transaction
- multiple requests sharing state that is not safe to share

## What `/api/zero/query` Does And Does Not Prove

`POST /api/zero/query` proves:

- the query name exists
- args validate
- the server can build the expected ZQL
- the AST mapping is valid

It does not prove:

- your adapter executes reads correctly
- your adapter executes writes correctly
- your mutation transaction semantics are correct
- your raw SQL bridge is correct
- your Drizzle wrapped transaction is safe

So if your production issue is “multiple mutations do not work well”, the first thing to avoid is treating `/api/zero/query` health as evidence that the adapter is healthy.

## What We Should Test

### Correctness Tests

These should be the minimum correctness suite for any custom Zero adapter.

1. Single mutation, single client
   Expected:
   - optimistic client update is visible
   - server mutation commits
   - LMID advances by 1
   - follow-up `zql.run(...)` read sees committed row

2. Sequential mutations from one client
   Expected:
   - mutation IDs are strictly increasing per client
   - no out-of-order errors
   - final DB state matches mutation sequence exactly

3. Burst mutations from one client
   Expected:
   - same final state as sequential issuance
   - no dropped writes
   - no duplicate writes
   - LMID equals last successfully processed mutation ID

4. Failed mutation in the middle of a batch
   Expected:
   - failed mutation result is persisted
   - optimistic effect is reverted on the client
   - later mutations behave according to Zero's batch semantics

5. Same data mutated from multiple clients
   Expected:
   - no internal adapter corruption
   - all clients converge to the same final state
   - external writes still replicate through `zero-cache`

6. Direct Postgres write outside Zero
   Expected:
   - write appears in replica
   - active queries update
   - clients converge without mutator participation

7. Raw SQL inside server mutator
   Expected:
   - `tx.dbTransaction.query(...)` sees the same transactional state as Zero CRUD helpers

8. Native Drizzle access inside server mutator
   Expected:
   - `tx.dbTransaction.wrappedTransaction` reads and writes the same live transaction

### Performance Tests

There are four distinct layers worth measuring:

1. raw direct Drizzle baseline
2. adapter-backed `DBConnection` write path
3. Zero mutation path through `handleMutateRequest(...)`
4. adapter-backed read path through `zql.run(...)`

And a fifth, separate measurement:

5. Zero query transform overhead through `handleQueryRequest(...)`

That fifth one is useful, but only as transform overhead. It should not be used as an adapter comparison.

## Metrics That Actually Matter

### Mutation Metrics

For mutation-heavy bugs, measure:

- optimistic client latency
  Time from `zero.mutate(...)` call to `.client` resolution.
- server ack latency
  Time from `zero.mutate(...)` call to `.server` resolution.
- LMID progression
  Ensure LMID increases exactly once per successfully processed mutation.
- convergence latency
  Time from server commit until all subscribed clients see the same final state.
- failure rate under burst load
  App errors, out-of-order mutations, duplicate detection, retries.

### Query Metrics

For query performance, measure:

- initial optimistic hydrate
- first authoritative hydrate
- server hydration time
- read row count vs synced row count
- update client/server p50 and p95
- rehydrate frequency from TTL churn

These are exposed through the Zero inspector and analyzer tools.

## Debug Workflow

### 1. Inspector

Use the browser inspector first.

Useful fields:

- `clientZQL`
- `serverZQL`
- `hydrateClient`
- `hydrateServer`
- `hydrateTotal`
- `rowCount`
- `updateClientP50`
- `updateClientP95`
- `updateServerP50`
- `updateServerP95`

For query debugging, inspect the group as well as the current client. Zero syncs by client group.

### 2. Analyze Query Plans

Use:

```bash
npx analyze-query --schema-path="./schema.ts" --replica-file="./zero.db" --query='...'
```

Look for:

- `TEMP B-TREE`
- large `Rows Scanned`
- read row count much larger than synced row count

The docs explicitly note that upstream indexes must include the effective ordering Zero uses, including appended primary-key columns when needed for stable order.

### 3. Decode ASTs

If `serverZQL` or logged ASTs are confusing:

```bash
cat ast.json | npx ast-to-zql --schema schema.ts
```

### 4. Inspect The Replica

Use:

```bash
npx @rocicorp/zero-sqlite3 /path/to/zero.db
```

Check:

- application tables
- `_zero.*` tables
- `zero_0.clients`
- replication state

### 5. Check `zero-cache` Health

Use:

- slow query logs
- `/statz`
- CVR flush timing
- replication lag symptoms

From the Zero deployment docs, the main server-side bottlenecks are:

- SQLite scan/index cost during hydration
- query transform latency at `ZERO_QUERY_URL`
- replication throughput
- changed-row volume per transaction
- IOPS / storage throughput
- network locality between `zero-cache`, CVR DB, and upstream Postgres

## What To Expect Under Multiple Mutations

If the integration is correct, multiple mutations should not require special application logic.

The expected behavior is:

- client mutators can be fired quickly
- optimistic state updates immediately
- server mutation IDs remain monotonic per client
- server-side transactions are isolated and ordered by LMID semantics
- final state converges via replication even if optimistic UI was temporary

The most suspicious smells are:

- creating multiple incompatible client IDs for what should be one logical stream
- sharing non-request-safe database state across Cloudflare worker requests
- not awaiting writes inside mutators
- mixing adapter-backed writes and unrelated writes without understanding which path owns optimistic reconciliation
- measuring only HTTP endpoint latency instead of convergence latency

## Cloudflare-Specific Note

For Cloudflare-style deployments, do not assume you can safely share TCP-backed Postgres state across worker requests.

That means:

- request-scoped connection/runtime behavior is the safe default
- local Node benchmark results are useful for adapter comparison
- they are not identical to worker-runtime behavior
- the worker-facing benchmark should focus on correctness and modest single/serial load, not aggressive parallel TCP pressure

## Recommended Test Ladder For A Real App

If a production app is misbehaving under multiple mutations, the next testing order should be:

1. verify one mutation end to end
2. verify 10 sequential mutations from one client
3. verify 100 sequential mutations from one client
4. verify 10 fire-and-forget mutations from one client
5. verify two clients mutating the same rows
6. measure `.client`, `.server`, and convergence latency separately
7. inspect active query metrics and query plans in the Zero inspector
8. inspect replica contents and LMID rows directly

## Sources

Official docs:

- [What is Sync?](https://zero.rocicorp.dev/docs/sync)
- [Install Zero](https://zero.rocicorp.dev/docs/install)
- [Queries](https://zero.rocicorp.dev/docs/queries)
- [Writing Data](https://zero.rocicorp.dev/docs/writing-data)
- [Slow Queries](https://zero.rocicorp.dev/docs/debug/slow-queries)
- [Query ASTs](https://zero.rocicorp.dev/docs/debug/query-asts)
- [Inspector](https://zero.rocicorp.dev/docs/debug/inspector)
- [Replication](https://zero.rocicorp.dev/docs/debug/replication)
- [Deploying Zero](https://zero.rocicorp.dev/docs/deployment)
- [Connecting to Postgres](https://zero.rocicorp.dev/docs/connecting-to-postgres)

Upstream code:

- [process-mutations.ts](/Users/am/Coding/2026/effect-zero/.context/rocicorp-mono/packages/zero-server/src/process-mutations.ts)
- [process-queries.ts](/Users/am/Coding/2026/effect-zero/.context/rocicorp-mono/packages/zero-server/src/queries/process-queries.ts)
- [zql-database.ts](/Users/am/Coding/2026/effect-zero/.context/rocicorp-mono/packages/zero-server/src/zql-database.ts)
