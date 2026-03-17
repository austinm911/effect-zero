import { album as albumTable } from "@effect-zero/example-data/db";
import {
  cartMutatorDefinitions,
  mutators as baseMutators,
} from "@effect-zero/example-data/mutators";
import { queries } from "@effect-zero/example-data/queries";
import { schema as zeroSchema } from "@effect-zero/example-data/zero";
import {
  MUSIC_FIXTURE_API_DEFAULTS,
  getMusicFixtureApiTargetSpec,
  musicFixtureApiTargetIds,
  type MusicFixtureApiTargetId,
} from "@effect-zero/test-utils/api-fixtures";
import { zeroEffectNodePg as zeroEffectV3NodePg } from "@effect-zero/v3/server/adapters/pg";
import { zeroEffectPostgresJS as zeroEffectV3PostgresJS } from "@effect-zero/v3/server/adapters/postgresjs";
import { createZeroDbProvider as createV3ZeroDbProvider } from "@effect-zero/v3/server/adapters/drizzle";
import {
  createRestMutatorHandler as createV3RestMutatorHandler,
  createServerMutatorHandler as createV3ServerMutatorHandler,
  extendServerMutator as extendV3ServerMutator,
} from "@effect-zero/v3/server";
import { zeroEffectNodePg as zeroEffectV4NodePg } from "@effect-zero/v4/server/adapters/pg";
import { zeroEffectPostgresJS as zeroEffectV4PostgresJS } from "@effect-zero/v4/server/adapters/postgresjs";
import { createZeroDbProvider as createV4ZeroDbProvider } from "@effect-zero/v4/server/adapters/drizzle";
import {
  createRestMutatorHandler as createV4RestMutatorHandler,
  createServerMutatorHandler as createV4ServerMutatorHandler,
  extendServerMutator as extendV4ServerMutator,
} from "@effect-zero/v4/server";
import {
  defineMutators,
  mustGetMutator,
  mustGetQuery,
  type ReadonlyJSONValue,
} from "@rocicorp/zero";
import { handleMutateRequest, handleQueryRequest } from "@rocicorp/zero/server";
import { zeroPostgresJS } from "@rocicorp/zero/server/adapters/postgresjs";
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import * as EffectV4 from "effect-v4/Effect";
import * as LayerV4 from "effect-v4/Layer";
import * as ServiceMapV4 from "effect-v4/ServiceMap";
import { getDatabaseUrl } from "./config.ts";
import { getSharedSqlClient } from "./shared-resources.ts";

type TargetRuntime = {
  readonly authoringMode: "raw-sql" | "service-workflow" | "shared-client-mutator";
  readonly serverDbApi: "raw-sql" | "wrapped-transaction" | "zero-postgresjs";
  directMutate(mutatorName: string, args: ReadonlyJSONValue | undefined): Promise<void>;
  mutate(request: Request): Promise<unknown>;
  query(request: Request): Promise<unknown>;
  zqlRead(body: { readonly args?: ReadonlyJSONValue; readonly name: string }): Promise<unknown>;
  dispose(): Promise<void>;
};

type TargetAuthoringSnapshot = {
  readonly afterCommitRuns: number;
  readonly mode: TargetRuntime["authoringMode"];
  readonly rawSqlMutations: number;
  readonly servicePlanRuns: number;
  readonly wrappedTransactionReads: number;
};

type ZeroProviderLike = {
  readonly zql: any;
  dispose(): Promise<void>;
};

type CachedValue<T> = {
  get(): Promise<T>;
  peek(): Promise<T> | undefined;
};

type ServiceWorkflowTarget = "v3-drizzle" | "v4-drizzle";
type V3SqlTarget = "v3-pg" | "v3-postgresjs";
type V4SqlTarget = "v4-pg" | "v4-postgresjs";

const targetAuthoringState = Object.fromEntries(
  musicFixtureApiTargetIds.map((target) => [
    target,
    createAuthoringSnapshot(getAuthoringModeForTarget(target)),
  ]),
) as Record<MusicFixtureApiTargetId, TargetAuthoringSnapshot>;

function getDemoContext() {
  return { userId: MUSIC_FIXTURE_API_DEFAULTS.userId };
}

function getMutationContext(args: ReadonlyJSONValue | undefined) {
  const benchmarkUserId =
    args && typeof args === "object"
      ? Array.isArray(args)
        ? args[0] &&
          typeof args[0] === "object" &&
          !Array.isArray(args[0]) &&
          "__benchmarkUserId" in args[0]
          ? args[0].__benchmarkUserId
          : undefined
        : "__benchmarkUserId" in args
          ? args.__benchmarkUserId
          : undefined
      : undefined;

  return {
    userId:
      typeof benchmarkUserId === "string" && benchmarkUserId.trim().length > 0
        ? benchmarkUserId
        : MUSIC_FIXTURE_API_DEFAULTS.userId,
  };
}

function createCachedValue<T>(factory: () => Promise<T>): CachedValue<T> {
  let cached: Promise<T> | undefined;

  return {
    get() {
      cached ??= factory();
      return cached;
    },
    peek() {
      return cached;
    },
  };
}

function createAuthoringSnapshot(mode: TargetRuntime["authoringMode"]): TargetAuthoringSnapshot {
  return {
    afterCommitRuns: 0,
    mode,
    rawSqlMutations: 0,
    servicePlanRuns: 0,
    wrappedTransactionReads: 0,
  };
}

function getAuthoringModeForTarget(
  target: MusicFixtureApiTargetId,
): TargetRuntime["authoringMode"] {
  if (target === "control") {
    return "shared-client-mutator";
  }

  return getMusicFixtureApiTargetSpec(target).adapter === "drizzle"
    ? "service-workflow"
    : "raw-sql";
}

function resetAuthoringSnapshot(target: MusicFixtureApiTargetId) {
  targetAuthoringState[target] = createAuthoringSnapshot(targetAuthoringState[target].mode);
}

function recordServicePlanRun(target: ServiceWorkflowTarget) {
  targetAuthoringState[target] = {
    ...targetAuthoringState[target],
    servicePlanRuns: targetAuthoringState[target].servicePlanRuns + 1,
  };
}

function recordAfterCommitRun(target: ServiceWorkflowTarget) {
  targetAuthoringState[target] = {
    ...targetAuthoringState[target],
    afterCommitRuns: targetAuthoringState[target].afterCommitRuns + 1,
  };
}

function recordWrappedTransactionRead(target: ServiceWorkflowTarget) {
  targetAuthoringState[target] = {
    ...targetAuthoringState[target],
    wrappedTransactionReads: targetAuthoringState[target].wrappedTransactionReads + 1,
  };
}

function recordRawSqlMutation(target: V3SqlTarget | V4SqlTarget) {
  targetAuthoringState[target] = {
    ...targetAuthoringState[target],
    rawSqlMutations: targetAuthoringState[target].rawSqlMutations + 1,
  };
}

export function readTargetAuthoringState(target: MusicFixtureApiTargetId) {
  return {
    ...targetAuthoringState[target],
  };
}

export function resetTargetAuthoringState(target?: MusicFixtureApiTargetId) {
  if (target) {
    resetAuthoringSnapshot(target);
    return;
  }

  for (const targetId of musicFixtureApiTargetIds) {
    resetAuthoringSnapshot(targetId);
  }
}

async function verifyWrappedTransactionAccess(
  wrappedTransaction: any,
  input: {
    readonly albumId: string;
    readonly target: ServiceWorkflowTarget;
  },
) {
  const rows = await wrappedTransaction
    .select()
    .from(albumTable)
    .where(eq(albumTable.id, input.albumId))
    .limit(1);

  if (rows.length === 0) {
    throw new Error(`Expected wrapped transaction to read album ${input.albumId}.`);
  }

  recordWrappedTransactionRead(input.target);
}

class V3DrizzleWorkflow extends Effect.Service<V3DrizzleWorkflow>()(
  "example-api/V3DrizzleWorkflow",
  {
    effect: Effect.sync(() => ({
      plan: (input: {
        readonly albumId: string;
        readonly target: "v3-drizzle";
        readonly wrappedTransaction: any;
      }) =>
        Effect.gen(function* () {
          recordServicePlanRun(input.target);
          yield* Effect.tryPromise(() =>
            verifyWrappedTransactionAccess(input.wrappedTransaction, input),
          );

          return {
            afterCommit: [
              Effect.sync(() => {
                recordAfterCommitRun(input.target);
              }),
            ] as const,
          };
        }),
    })),
  },
) {}

class V4DrizzleWorkflow extends ServiceMapV4.Service<
  V4DrizzleWorkflow,
  {
    readonly plan: (input: {
      readonly albumId: string;
      readonly target: "v4-drizzle";
      readonly wrappedTransaction: any;
    }) => EffectV4.Effect<{
      readonly afterCommit: ReadonlyArray<EffectV4.Effect<void>>;
    }>;
  }
>()("example-api/V4DrizzleWorkflow") {
  static readonly layer = LayerV4.succeed(this)({
    plan: (input) =>
      EffectV4.gen(function* () {
        recordServicePlanRun(input.target);
        yield* EffectV4.promise(() =>
          verifyWrappedTransactionAccess(input.wrappedTransaction, input),
        );

        return {
          afterCommit: [
            EffectV4.sync(() => {
              recordAfterCommitRun(input.target);
            }),
          ] as const,
        };
      }) as any,
  });
}

const controlZql = zeroPostgresJS(zeroSchema, getSharedSqlClient());

const getV3DrizzleProvider = createCachedValue(async () =>
  createV3ZeroDbProvider({
    connectionString: getDatabaseUrl(),
    drizzleSchema: await import("@effect-zero/example-data/db"),
    zeroSchema,
  }),
);

const getV4DrizzleProvider = createCachedValue(async () =>
  createV4ZeroDbProvider({
    connectionString: getDatabaseUrl(),
    drizzleSchema: await import("@effect-zero/example-data/db"),
    zeroSchema,
  }),
);

const getV3PgProvider = createCachedValue(async () =>
  zeroEffectV3NodePg(zeroSchema, getDatabaseUrl()),
);

const getV3PostgresJsProvider = createCachedValue(async () =>
  zeroEffectV3PostgresJS(zeroSchema, getSharedSqlClient()),
);

const getV4PgProvider = createCachedValue(async () =>
  zeroEffectV4NodePg(zeroSchema, getDatabaseUrl()),
);

const getV4PostgresJsProvider = createCachedValue(async () =>
  zeroEffectV4PostgresJS(zeroSchema, getSharedSqlClient()),
);

function createV3DrizzleMutators(target: "v3-drizzle") {
  return defineMutators(baseMutators, {
    cart: {
      add: extendV3ServerMutator(cartMutatorDefinitions.add, (input) => {
        const ctx = input.ctx;

        if (!ctx) {
          return Effect.fail(new Error("Missing demo context"));
        }

        return Effect.gen(function* () {
          yield* input.runDefaultMutation();

          const workflow = yield* V3DrizzleWorkflow;
          const result = yield* workflow.plan({
            albumId: input.args.albumId,
            target,
            wrappedTransaction: input.tx.dbTransaction.wrappedTransaction,
          });

          for (const effect of result.afterCommit) {
            input.defer(effect);
          }
        });
      }),
      remove: extendV3ServerMutator(cartMutatorDefinitions.remove, (input) => {
        const ctx = input.ctx;

        if (!ctx) {
          return Effect.fail(new Error("Missing demo context"));
        }

        return Effect.gen(function* () {
          yield* input.runDefaultMutation();

          const workflow = yield* V3DrizzleWorkflow;
          const result = yield* workflow.plan({
            albumId: input.args.albumId,
            target,
            wrappedTransaction: input.tx.dbTransaction.wrappedTransaction,
          });

          for (const effect of result.afterCommit) {
            input.defer(effect);
          }
        });
      }),
    },
  });
}

function createV4DrizzleMutators(target: "v4-drizzle") {
  return defineMutators(baseMutators, {
    cart: {
      add: extendV4ServerMutator(cartMutatorDefinitions.add, (input) => {
        const ctx = input.ctx;

        if (!ctx) {
          return EffectV4.fail(new Error("Missing demo context")) as any;
        }

        return EffectV4.gen(function* () {
          yield* input.runDefaultMutation() as any;

          const workflow = yield* V4DrizzleWorkflow as any;
          const result = yield* workflow.plan({
            albumId: input.args.albumId,
            target,
            wrappedTransaction: input.tx.dbTransaction.wrappedTransaction,
          }) as any;

          for (const effect of result.afterCommit) {
            input.defer(effect as any);
          }
        }) as any;
      }),
      remove: extendV4ServerMutator(cartMutatorDefinitions.remove, (input) => {
        const ctx = input.ctx;

        if (!ctx) {
          return EffectV4.fail(new Error("Missing demo context")) as any;
        }

        return EffectV4.gen(function* () {
          yield* input.runDefaultMutation() as any;

          const workflow = yield* V4DrizzleWorkflow as any;
          const result = yield* workflow.plan({
            albumId: input.args.albumId,
            target,
            wrappedTransaction: input.tx.dbTransaction.wrappedTransaction,
          }) as any;

          for (const effect of result.afterCommit) {
            input.defer(effect as any);
          }
        }) as any;
      }),
    },
  });
}

function createV3SqlMutators(target: V3SqlTarget) {
  return defineMutators(baseMutators, {
    cart: {
      add: extendV3ServerMutator(cartMutatorDefinitions.add, async ({ args, ctx, tx }) => {
        if (!ctx) {
          throw new Error("Missing demo context");
        }

        await tx.dbTransaction.query(
          `
            INSERT INTO cart_item (user_id, album_id, added_at)
            VALUES ($1, $2, $3)
            ON CONFLICT (user_id, album_id)
            DO UPDATE SET added_at = EXCLUDED.added_at
          `,
          [ctx.userId, args.albumId, args.addedAt],
        );
        recordRawSqlMutation(target);
      }),
      remove: extendV3ServerMutator(cartMutatorDefinitions.remove, async ({ args, ctx, tx }) => {
        if (!ctx) {
          throw new Error("Missing demo context");
        }

        await tx.dbTransaction.query(`DELETE FROM cart_item WHERE user_id = $1 AND album_id = $2`, [
          ctx.userId,
          args.albumId,
        ]);
        recordRawSqlMutation(target);
      }),
    },
  });
}

function createV4SqlMutators(target: V4SqlTarget) {
  return defineMutators(baseMutators, {
    cart: {
      add: extendV4ServerMutator(cartMutatorDefinitions.add, async ({ args, ctx, tx }) => {
        if (!ctx) {
          throw new Error("Missing demo context");
        }

        await tx.dbTransaction.query(
          `
            INSERT INTO cart_item (user_id, album_id, added_at)
            VALUES ($1, $2, $3)
            ON CONFLICT (user_id, album_id)
            DO UPDATE SET added_at = EXCLUDED.added_at
          `,
          [ctx.userId, args.albumId, args.addedAt],
        );
        recordRawSqlMutation(target);
      }),
      remove: extendV4ServerMutator(cartMutatorDefinitions.remove, async ({ args, ctx, tx }) => {
        if (!ctx) {
          throw new Error("Missing demo context");
        }

        await tx.dbTransaction.query(`DELETE FROM cart_item WHERE user_id = $1 AND album_id = $2`, [
          ctx.userId,
          args.albumId,
        ]);
        recordRawSqlMutation(target);
      }),
    },
  });
}

const v3DrizzleMutators = createV3DrizzleMutators("v3-drizzle");
const v3PgMutators = createV3SqlMutators("v3-pg");
const v3PostgresJsMutators = createV3SqlMutators("v3-postgresjs");
const v4DrizzleMutators = createV4DrizzleMutators("v4-drizzle");
const v4PgMutators = createV4SqlMutators("v4-pg");
const v4PostgresJsMutators = createV4SqlMutators("v4-postgresjs");

const executeV3DrizzleEffect = <A, E, R>(input: { readonly effect: Effect.Effect<A, E, R> }) =>
  Effect.runPromise(
    Effect.provide(input.effect, V3DrizzleWorkflow.Default) as Effect.Effect<A, E, never>,
  ) as Promise<A>;

const executeV4DrizzleEffect = <A>(input: { readonly effect: any }) =>
  EffectV4.runPromise(EffectV4.provide(input.effect, V4DrizzleWorkflow.layer) as any) as Promise<A>;

const v3DrizzleHandler = createV3ServerMutatorHandler({
  executeEffect: executeV3DrizzleEffect,
  getContext: (mutation) => getMutationContext(mutation.args),
  mutators: v3DrizzleMutators,
});

const v3DrizzleDirectHandler = createV3RestMutatorHandler({
  executeEffect: executeV3DrizzleEffect,
  getContext: (mutation) => getMutationContext(mutation.args),
  mutators: v3DrizzleMutators,
});

const v3PgHandler = createV3ServerMutatorHandler({
  getContext: (mutation) => getMutationContext(mutation.args),
  mutators: v3PgMutators,
});

const v3PgDirectHandler = createV3RestMutatorHandler({
  getContext: (mutation) => getMutationContext(mutation.args),
  mutators: v3PgMutators,
});

const v3PostgresJsHandler = createV3ServerMutatorHandler({
  getContext: (mutation) => getMutationContext(mutation.args),
  mutators: v3PostgresJsMutators,
});

const v3PostgresJsDirectHandler = createV3RestMutatorHandler({
  getContext: (mutation) => getMutationContext(mutation.args),
  mutators: v3PostgresJsMutators,
});

const v4DrizzleHandler = createV4ServerMutatorHandler({
  executeEffect: executeV4DrizzleEffect,
  getContext: (mutation) => getMutationContext(mutation.args),
  mutators: v4DrizzleMutators,
});

const v4DrizzleDirectHandler = createV4RestMutatorHandler({
  executeEffect: executeV4DrizzleEffect,
  getContext: (mutation) => getMutationContext(mutation.args),
  mutators: v4DrizzleMutators,
});

const v4PgHandler = createV4ServerMutatorHandler({
  getContext: (mutation) => getMutationContext(mutation.args),
  mutators: v4PgMutators,
});

const v4PgDirectHandler = createV4RestMutatorHandler({
  getContext: (mutation) => getMutationContext(mutation.args),
  mutators: v4PgMutators,
});

const v4PostgresJsHandler = createV4ServerMutatorHandler({
  getContext: (mutation) => getMutationContext(mutation.args),
  mutators: v4PostgresJsMutators,
});

const v4PostgresJsDirectHandler = createV4RestMutatorHandler({
  getContext: (mutation) => getMutationContext(mutation.args),
  mutators: v4PostgresJsMutators,
});

function createControlRuntime(): TargetRuntime {
  return {
    authoringMode: "shared-client-mutator",
    serverDbApi: "zero-postgresjs",
    async directMutate(mutatorName, args) {
      const mutator = mustGetMutator(baseMutators, mutatorName);
      await controlZql.transaction(async (tx) => {
        await mutator.fn({
          args,
          ctx: getMutationContext(args),
          tx,
        });
      });
    },
    async mutate(request) {
      return handleMutateRequest(
        controlZql,
        async (transact) =>
          transact(async (tx, name, args) => {
            const mutator = mustGetMutator(baseMutators, name);
            await mutator.fn({
              args,
              ctx: getMutationContext(args),
              tx,
            });
          }),
        request,
      );
    },
    async query(request) {
      return handleQueryRequest(
        (name, args) => mustGetQuery(queries, name).fn({ args, ctx: getDemoContext() }),
        zeroSchema,
        request,
      );
    },
    async zqlRead(body) {
      const query = mustGetQuery(queries, body.name);
      return controlZql.run(query.fn({ args: body.args, ctx: getDemoContext() }) as never);
    },
    async dispose() {},
  };
}

function createPackageRuntime(options: {
  readonly authoringMode: TargetRuntime["authoringMode"];
  readonly directHandler: (input: {
    readonly db: any;
    readonly mutation: { readonly args?: ReadonlyJSONValue; readonly name: string };
  }) => Promise<void>;
  readonly handler: any;
  readonly provider: CachedValue<ZeroProviderLike>;
  readonly serverDbApi: TargetRuntime["serverDbApi"];
}): TargetRuntime {
  return {
    authoringMode: options.authoringMode,
    serverDbApi: options.serverDbApi,
    async directMutate(mutatorName, args) {
      const provider = await options.provider.get();
      await options.directHandler({
        db: provider.zql,
        mutation: {
          args,
          name: mutatorName,
        },
      });
    },
    async mutate(request) {
      const provider = await options.provider.get();
      return handleMutateRequest(provider.zql, options.handler, request);
    },
    async query(request) {
      return handleQueryRequest(
        (name, args) => mustGetQuery(queries, name).fn({ args, ctx: getDemoContext() }),
        zeroSchema,
        request,
      );
    },
    async zqlRead(body) {
      const provider = await options.provider.get();
      const query = mustGetQuery(queries, body.name);
      return provider.zql.run(query.fn({ args: body.args, ctx: getDemoContext() }) as never);
    },
    async dispose() {
      const cachedProvider = options.provider.peek();

      if (!cachedProvider) {
        return;
      }

      const provider = await cachedProvider;
      await provider.dispose();
    },
  };
}

const runtimes: Record<MusicFixtureApiTargetId, TargetRuntime> = {
  control: createControlRuntime(),
  "v3-drizzle": createPackageRuntime({
    authoringMode: "service-workflow",
    directHandler: v3DrizzleDirectHandler,
    handler: v3DrizzleHandler,
    provider: getV3DrizzleProvider,
    serverDbApi: "wrapped-transaction",
  }),
  "v3-pg": createPackageRuntime({
    authoringMode: "raw-sql",
    directHandler: v3PgDirectHandler,
    handler: v3PgHandler,
    provider: getV3PgProvider,
    serverDbApi: "raw-sql",
  }),
  "v3-postgresjs": createPackageRuntime({
    authoringMode: "raw-sql",
    directHandler: v3PostgresJsDirectHandler,
    handler: v3PostgresJsHandler,
    provider: getV3PostgresJsProvider,
    serverDbApi: "raw-sql",
  }),
  "v4-drizzle": createPackageRuntime({
    authoringMode: "service-workflow",
    directHandler: v4DrizzleDirectHandler,
    handler: v4DrizzleHandler,
    provider: getV4DrizzleProvider,
    serverDbApi: "wrapped-transaction",
  }),
  "v4-pg": createPackageRuntime({
    authoringMode: "raw-sql",
    directHandler: v4PgDirectHandler,
    handler: v4PgHandler,
    provider: getV4PgProvider,
    serverDbApi: "raw-sql",
  }),
  "v4-postgresjs": createPackageRuntime({
    authoringMode: "raw-sql",
    directHandler: v4PostgresJsDirectHandler,
    handler: v4PostgresJsHandler,
    provider: getV4PostgresJsProvider,
    serverDbApi: "raw-sql",
  }),
};

export function getTargetRuntime(target: MusicFixtureApiTargetId) {
  return runtimes[target];
}

export async function disposeTargetRuntimes() {
  await Promise.all(Object.values(runtimes).map((runtime) => runtime.dispose()));
}
