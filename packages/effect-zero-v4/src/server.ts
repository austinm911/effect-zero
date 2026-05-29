import type { ReadonlyJSONValue } from "@rocicorp/zero";
import {
  defineMutatorWithType,
  mustGetMutator,
  type MutatorDefinition,
  type Schema as ZeroSchema,
  type ServerTransaction,
  type Transaction,
} from "@rocicorp/zero";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import * as Effect from "effect/Effect";

export type { EffectPgConfig, EffectZeroProvider } from "./server/types.js";
export {
  asErrorShape,
  isPushResponseLike,
  type ErrorShape,
  type PushResponseLike,
  type PushResponseMutation,
} from "./server/push.js";

export interface ServerMutationLike {
  readonly args?: ReadonlyJSONValue;
  readonly clientID: string;
  readonly id: number;
  readonly name: string;
}

export interface RestMutationLike {
  readonly args?: ReadonlyJSONValue;
  readonly clientID?: string;
  readonly id?: number;
  readonly name: string;
}

type MutatorArgs = ReadonlyJSONValue | undefined;
type DeferredEffect<TServices = unknown> = Effect.Effect<unknown, unknown, TServices>;

interface MutationExecutionState<TServices = unknown> {
  readonly deferredEffects: DeferredEffect<TServices>[];
  readonly executeEffect: (effect: DeferredEffect<TServices>) => Promise<unknown>;
}

const mutationExecutionStateByTransaction = new WeakMap<object, unknown>();

export interface ExecuteEffectInput<
  TContext,
  TSchema extends ZeroSchema,
  TWrappedTransaction,
  TServices,
  A,
  E,
  R extends TServices,
> {
  readonly ctx: TContext;
  readonly effect: Effect.Effect<A, E, R>;
  readonly mutation: ServerMutationLike;
  runWithExecutionContext<A2, E2>(effect: Effect.Effect<A2, E2, never>): Promise<A2>;
  readonly tx?: ServerTransaction<TSchema, TWrappedTransaction>;
}

type PendingExecuteEffectInput<
  TContext,
  TSchema extends ZeroSchema,
  TWrappedTransaction,
  TServices,
  A,
  E,
  R extends TServices,
> = {
  readonly ctx: TContext;
  readonly effect: Effect.Effect<A, E, R>;
  readonly mutation: ServerMutationLike;
  readonly tx?: ServerTransaction<TSchema, TWrappedTransaction>;
};

export type EffectExecutionPhase = "inline" | "deferred";

export interface ObserveMutationInput<TContext, TSchema extends ZeroSchema, TWrappedTransaction> {
  readonly ctx: TContext;
  readonly mutation: ServerMutationLike;
  readonly tx: ServerTransaction<TSchema, TWrappedTransaction>;
}

export interface ObserveEffectInput<
  TContext,
  TSchema extends ZeroSchema,
  TWrappedTransaction,
  TServices,
  A,
  E,
  R extends TServices,
> {
  readonly ctx: TContext;
  readonly effect: Effect.Effect<A, E, R>;
  readonly mutation: ServerMutationLike;
  readonly phase: EffectExecutionPhase;
  readonly tx?: ServerTransaction<TSchema, TWrappedTransaction>;
}

export interface MutationExecutorInstrumentation<
  TContext,
  TSchema extends ZeroSchema,
  TWrappedTransaction,
  TServices = unknown,
> {
  observeMutation?<A>(
    input: ObserveMutationInput<TContext, TSchema, TWrappedTransaction>,
    run: () => Promise<A>,
  ): Promise<A>;
  observeEffect?<A, E, R extends TServices>(
    input: ObserveEffectInput<TContext, TSchema, TWrappedTransaction, TServices, A, E, R>,
    run: () => Promise<A>,
  ): Promise<A>;
}

export interface PostCommitTask<TContext, TServices = unknown> {
  readonly ctx: TContext;
  readonly effect: DeferredEffect<TServices>;
  readonly mutation: ServerMutationLike;
  run(): Promise<void>;
}

export type PostCommitScheduler<TContext, TServices = unknown> = (
  task: PostCommitTask<TContext, TServices>,
) => Promise<void>;

const effectMutatorServices: unique symbol = Symbol("effect-zero.services");

type EffectServicesMarker<TServices> = {
  readonly [effectMutatorServices]: (_: TServices) => TServices;
};

function addEffectServicesMarker<TServices>() {
  return <TDefinition extends object>(
    definition: TDefinition,
  ): TDefinition & EffectServicesMarker<TServices> =>
    Object.assign(definition, {
      [effectMutatorServices]: (services: TServices) => services,
    });
}

type EffectMutatorServicesOf<TValue> =
  TValue extends EffectServicesMarker<infer TServices>
    ? TServices
    : TValue extends MutatorDefinition<infer _Input, infer _Output, infer _Context, infer _Tx>
      ? never
      : TValue extends object
        ? { [TKey in keyof TValue]: EffectMutatorServicesOf<TValue[TKey]> }[keyof TValue]
        : never;

export type EffectMutatorServices<TMutators> = [EffectMutatorServicesOf<TMutators>] extends [never]
  ? unknown
  : EffectMutatorServicesOf<TMutators>;

type ExecuteEffectHandler<TContext, TSchema extends ZeroSchema, TWrappedTransaction, TServices> = <
  A,
  E,
  R extends TServices,
>(
  input: ExecuteEffectInput<TContext, TSchema, TWrappedTransaction, TServices, A, E, R>,
) => Promise<A>;

type ExecuteEffectOption<TContext, TSchema extends ZeroSchema, TWrappedTransaction, TServices> = [
  TServices,
] extends [never]
  ? {
      readonly executeEffect?: ExecuteEffectHandler<
        TContext,
        TSchema,
        TWrappedTransaction,
        TServices
      >;
    }
  : unknown extends TServices
    ? {
        readonly executeEffect?: ExecuteEffectHandler<
          TContext,
          TSchema,
          TWrappedTransaction,
          TServices
        >;
      }
    : {
        readonly executeEffect: ExecuteEffectHandler<
          TContext,
          TSchema,
          TWrappedTransaction,
          TServices
        >;
      };

type MutationExecutorRuntimeOptions<
  TContext,
  TSchema extends ZeroSchema,
  TWrappedTransaction,
  TServices,
> = {
  readonly executeEffect?: ExecuteEffectHandler<TContext, TSchema, TWrappedTransaction, TServices>;
  readonly instrumentation?: MutationExecutorInstrumentation<
    TContext,
    TSchema,
    TWrappedTransaction,
    TServices
  >;
};

export type CreateMutationExecutorOptions<
  TMutators,
  TSchema extends ZeroSchema,
  TContext,
  TWrappedTransaction,
  TServices = EffectMutatorServices<TMutators>,
> = {
  readonly getContext: (mutation: ServerMutationLike) => Promise<TContext> | TContext;
  readonly mutators: TMutators;
  readonly instrumentation?: MutationExecutorInstrumentation<
    TContext,
    TSchema,
    TWrappedTransaction,
    TServices
  >;
  readonly postCommitScheduler?: PostCommitScheduler<TContext, TServices>;
} & ExecuteEffectOption<TContext, TSchema, TWrappedTransaction, TServices>;

export type CreateServerMutatorHandlerOptions<
  TMutators,
  TSchema extends ZeroSchema,
  TContext,
  TWrappedTransaction,
  TServices = EffectMutatorServices<TMutators>,
> = CreateMutationExecutorOptions<TMutators, TSchema, TContext, TWrappedTransaction, TServices>;

export interface MutationExecutorInvocation<
  TSchema extends ZeroSchema,
  TWrappedTransaction,
  TResponse,
> {
  readonly mutation: ServerMutationLike;
  runTransaction(
    execute: (
      tx: ServerTransaction<TSchema, TWrappedTransaction>,
      mutatorName: string,
      mutatorArgs: MutatorArgs,
    ) => Promise<void>,
  ): Promise<TResponse>;
}

export interface RestMutatorTransactionHost<
  TSchema extends ZeroSchema = ZeroSchema,
  TWrappedTransaction = unknown,
> {
  transaction<A>(
    callback: (tx: ServerTransaction<TSchema, TWrappedTransaction>) => Promise<A>,
  ): Promise<A>;
}

export interface RestMutatorInvocation<
  TSchema extends ZeroSchema = ZeroSchema,
  TWrappedTransaction = unknown,
> {
  readonly db: RestMutatorTransactionHost<TSchema, TWrappedTransaction>;
  readonly mutation: RestMutationLike;
}

export interface ExtendServerMutatorInput<
  TArgs extends MutatorArgs,
  TSchema extends ZeroSchema,
  TContext,
  TWrappedTransaction,
  TServices = unknown,
> {
  readonly args: TArgs;
  readonly ctx: TContext;
  readonly tx: ServerTransaction<TSchema, TWrappedTransaction>;
  defer(effect: DeferredEffect<TServices>): void;
  runDefaultMutation(): Effect.Effect<void, unknown, never>;
}

export type ServerEffectMutatorResult<TServices = unknown> =
  | void
  | Promise<void>
  | Effect.Effect<void, unknown, TServices>;
type ServerOverrideResult<TServices = unknown> = ServerEffectMutatorResult<TServices>;
type ServerEffectApiName = "defineEffectMutatorWithType" | "extendServerMutator";

type StandardSchemaLike = StandardSchemaV1<MutatorArgs, MutatorArgs>;

type InferStandardSchemaInput<TValidator extends StandardSchemaLike> =
  TValidator extends StandardSchemaV1<infer TInput, MutatorArgs>
    ? Extract<TInput, MutatorArgs>
    : never;

type InferStandardSchemaOutput<TValidator extends StandardSchemaLike> =
  TValidator extends StandardSchemaV1<MutatorArgs, infer TOutput>
    ? Extract<TOutput, MutatorArgs>
    : never;

type AnyMutatorDefinition = MutatorDefinition<MutatorArgs, MutatorArgs, unknown, unknown>;

function isStandardSchemaLike(value: unknown): value is StandardSchemaLike {
  return (
    (typeof value === "object" || typeof value === "function") &&
    value !== null &&
    "~standard" in value
  );
}

export type EffectMutatorDefinitionFunction<
  TOutput extends MutatorArgs,
  TContext,
  TWrappedTransaction,
  TSchema extends ZeroSchema,
  TServices = unknown,
> = (input: {
  readonly args: TOutput;
  readonly ctx: TContext;
  defer(effect: DeferredEffect<TServices>): void;
  readonly tx: Transaction<TSchema, TWrappedTransaction>;
}) => ServerEffectMutatorResult<TServices>;

export type TypedDefineEffectMutator<TSchema extends ZeroSchema, TContext, TWrappedTransaction> = {
  <TArgs extends MutatorArgs, TServices = never>(
    mutator: EffectMutatorDefinitionFunction<
      TArgs,
      TContext,
      TWrappedTransaction,
      TSchema,
      TServices
    >,
  ): MutatorDefinition<TArgs, TArgs, TContext, TWrappedTransaction> &
    EffectServicesMarker<TServices>;

  <TValidator extends StandardSchemaLike, TServices = never>(
    validator: TValidator,
    mutator: EffectMutatorDefinitionFunction<
      InferStandardSchemaOutput<TValidator>,
      TContext,
      TWrappedTransaction,
      TSchema,
      TServices
    >,
  ): MutatorDefinition<
    InferStandardSchemaInput<TValidator>,
    InferStandardSchemaOutput<TValidator>,
    TContext,
    TWrappedTransaction
  > &
    EffectServicesMarker<TServices>;
};

export type ExtendServerMutatorOverride<
  TOutput extends MutatorArgs,
  TSchema extends ZeroSchema,
  TContext,
  TWrappedTransaction,
  TServices = unknown,
> = (
  input: ExtendServerMutatorInput<TOutput, TSchema, TContext, TWrappedTransaction, TServices>,
) => ServerOverrideResult<TServices>;

export type TypedExtendServerMutator<TSchema extends ZeroSchema, TContext, TWrappedTransaction> = <
  TBaseMutator extends AnyMutatorDefinition,
  TServices = never,
>(
  baseMutator: TBaseMutator,
  override: ExtendServerMutatorOverride<
    TBaseMutator["~"]["$output"],
    TSchema,
    TContext,
    TWrappedTransaction,
    TServices
  >,
) => MutatorDefinition<
  TBaseMutator["~"]["$input"],
  TBaseMutator["~"]["$output"],
  TContext,
  TWrappedTransaction
> &
  EffectServicesMarker<TServices>;

function executeServerEffectResult<TSchema extends ZeroSchema, TWrappedTransaction, TServices>(
  tx: import("@rocicorp/zero").Transaction<TSchema, TWrappedTransaction>,
  result: ServerEffectMutatorResult<TServices>,
  apiName: ServerEffectApiName,
) {
  if (!Effect.isEffect(result)) {
    return Promise.resolve(result);
  }

  return getServerMutationExecution<TServices, TSchema, TWrappedTransaction>(
    tx,
    apiName,
  ).state.executeEffect(result);
}

function getServerMutationExecution<TServices, TSchema extends ZeroSchema, TWrappedTransaction>(
  tx: import("@rocicorp/zero").Transaction<TSchema, TWrappedTransaction>,
  apiName: ServerEffectApiName,
) {
  if (tx.location !== "server") {
    throw new Error(`${apiName} may only run on the authoritative server path.`);
  }

  const executionState = mutationExecutionStateByTransaction.get(tx) as
    | MutationExecutionState<TServices>
    | undefined;

  if (!executionState) {
    throw new Error(
      `${apiName} requires createMutationExecutor, createServerMutatorHandler, or createRestMutatorHandler so deferred effects and Effect execution stay request-scoped.`,
    );
  }

  return {
    state: executionState,
    tx,
  };
}

export function defineEffectMutatorWithType<
  TSchema extends ZeroSchema,
  TContext,
  TWrappedTransaction,
>(): TypedDefineEffectMutator<TSchema, TContext, TWrappedTransaction> {
  const define = defineMutatorWithType<TSchema, TContext, TWrappedTransaction>();

  function wrapMutator<TOutput extends MutatorArgs, TServices>(
    mutator: EffectMutatorDefinitionFunction<
      TOutput,
      TContext,
      TWrappedTransaction,
      TSchema,
      TServices
    >,
  ) {
    return async ({
      args,
      ctx,
      tx,
    }: {
      readonly args: TOutput;
      readonly ctx: TContext;
      readonly tx: import("@rocicorp/zero").Transaction<TSchema, TWrappedTransaction>;
    }) => {
      const defer = (effect: DeferredEffect<TServices>) => {
        getServerMutationExecution<TServices, TSchema, TWrappedTransaction>(
          tx,
          "defineEffectMutatorWithType",
        ).state.deferredEffects.push(effect);
      };

      const result = mutator({
        args,
        ctx,
        defer,
        tx,
      });

      await executeServerEffectResult(tx, result, "defineEffectMutatorWithType");
    };
  }

  function defineTypedEffectMutator<TValidator extends StandardSchemaLike, TServices = never>(
    validatorOrMutator:
      | TValidator
      | EffectMutatorDefinitionFunction<
          MutatorArgs,
          TContext,
          TWrappedTransaction,
          TSchema,
          TServices
        >,
    maybeMutator?: EffectMutatorDefinitionFunction<
      InferStandardSchemaOutput<TValidator>,
      TContext,
      TWrappedTransaction,
      TSchema,
      TServices
    >,
  ) {
    if (typeof maybeMutator === "function") {
      if (!isStandardSchemaLike(validatorOrMutator)) {
        throw new TypeError("defineEffectMutatorWithType expected a Standard Schema validator.");
      }

      return addEffectServicesMarker<TServices>()(
        define(
          validatorOrMutator as unknown as StandardSchemaV1<
            MutatorArgs,
            InferStandardSchemaOutput<TValidator>
          >,
          wrapMutator(maybeMutator),
        ),
      );
    }

    if (isStandardSchemaLike(validatorOrMutator)) {
      throw new TypeError("defineEffectMutatorWithType expected a mutator function.");
    }

    return addEffectServicesMarker<TServices>()(define(wrapMutator(validatorOrMutator)));
  }

  return defineTypedEffectMutator as TypedDefineEffectMutator<
    TSchema,
    TContext,
    TWrappedTransaction
  >;
}

export function createInlinePostCommitScheduler<
  TContext,
  TServices = unknown,
>(): PostCommitScheduler<TContext, TServices> {
  return async (task) => {
    await task.run();
  };
}

export function createWaitUntilPostCommitScheduler<TContext, TServices = unknown>(options: {
  readonly onDeferredError: (input: {
    readonly error: unknown;
    readonly task: PostCommitTask<TContext, TServices>;
  }) => void | Promise<void>;
  readonly waitUntil: (promise: Promise<unknown>) => void;
}): PostCommitScheduler<TContext, TServices> {
  return async (task) => {
    const deferredPromise = Promise.resolve()
      .then(() => task.run())
      .catch(async (error) => {
        await options.onDeferredError({
          error,
          task,
        });
      });

    options.waitUntil(deferredPromise);
  };
}

export function extendServerMutator<
  TInput extends MutatorArgs,
  TOutput extends MutatorArgs,
  TSchema extends ZeroSchema,
  TContext,
  TWrappedTransaction,
  TServices = never,
>(
  baseMutator: MutatorDefinition<TInput, TOutput, TContext, TWrappedTransaction>,
  override: (
    input: ExtendServerMutatorInput<TOutput, TSchema, TContext, TWrappedTransaction, TServices>,
  ) => ServerOverrideResult<TServices>,
): MutatorDefinition<TInput, TOutput, TContext, TWrappedTransaction> &
  EffectServicesMarker<TServices> {
  const define = defineMutatorWithType<TSchema, TContext, TWrappedTransaction>();
  const runOverride = async ({
    args,
    ctx,
    tx,
  }: {
    readonly args: TOutput;
    readonly ctx: TContext;
    readonly tx: import("@rocicorp/zero").Transaction<TSchema, TWrappedTransaction>;
  }) => {
    const { state: executionState, tx: serverTx } = getServerMutationExecution<
      TServices,
      TSchema,
      TWrappedTransaction
    >(tx, "extendServerMutator");

    let didRunDefaultMutation = false;

    const runDefaultMutation = () =>
      Effect.suspend(() => {
        if (didRunDefaultMutation) {
          return Effect.fail(
            new Error("runDefaultMutation() may only be called once per server mutation."),
          );
        }

        didRunDefaultMutation = true;
        return Effect.tryPromise({
          catch: (error) => error,
          try: () =>
            baseMutator.fn({
              args,
              ctx,
              tx: serverTx,
            }),
        });
      });

    const result = override({
      args,
      ctx,
      defer: (effect) => {
        executionState.deferredEffects.push(effect);
      },
      runDefaultMutation,
      tx: serverTx,
    });

    await executeServerEffectResult(serverTx, result, "extendServerMutator");
  };

  if (baseMutator.validator) {
    return addEffectServicesMarker<TServices>()(define(baseMutator.validator, runOverride));
  }

  return addEffectServicesMarker<TServices>()(
    define(runOverride) as unknown as MutatorDefinition<
      TInput,
      TOutput,
      TContext,
      TWrappedTransaction
    >,
  );
}

export function extendEffectMutatorWithType<
  TSchema extends ZeroSchema,
  TContext,
  TWrappedTransaction,
>(): TypedExtendServerMutator<TSchema, TContext, TWrappedTransaction> {
  return extendServerMutator as unknown as TypedExtendServerMutator<
    TSchema,
    TContext,
    TWrappedTransaction
  >;
}

interface EffectExecutionRunner {
  runEffect<A, E>(effect: Effect.Effect<A, E, never>): Promise<A>;
}

function hasEffectExecutionRunner(value: unknown): value is EffectExecutionRunner {
  return (
    typeof value === "object" &&
    value !== null &&
    "runEffect" in value &&
    typeof value.runEffect === "function"
  );
}

function getEffectExecutionRunner(value: unknown): EffectExecutionRunner | undefined {
  if (hasEffectExecutionRunner(value)) {
    return value;
  }

  if (typeof value !== "object" || value === null || !("wrappedTransaction" in value)) {
    return undefined;
  }

  const wrappedTransaction = value.wrappedTransaction;
  return hasEffectExecutionRunner(wrappedTransaction) ? wrappedTransaction : undefined;
}

function resolveTransactionEffectRunner<TSchema extends ZeroSchema, TWrappedTransaction>(
  tx?: ServerTransaction<TSchema, TWrappedTransaction>,
) {
  return getEffectExecutionRunner(tx?.dbTransaction);
}

function createRunWithExecutionContext<TSchema extends ZeroSchema, TWrappedTransaction>(
  tx?: ServerTransaction<TSchema, TWrappedTransaction>,
) {
  const transactionRunner = resolveTransactionEffectRunner(tx);
  return <A, E>(effect: Effect.Effect<A, E, never>) =>
    transactionRunner ? transactionRunner.runEffect(effect) : Effect.runPromise(effect);
}

function executeEffectWithOptions<
  TSchema extends ZeroSchema,
  TContext,
  TWrappedTransaction,
  TServices,
  A,
  E,
  R extends TServices,
>(
  options: MutationExecutorRuntimeOptions<TContext, TSchema, TWrappedTransaction, TServices>,
  input: PendingExecuteEffectInput<TContext, TSchema, TWrappedTransaction, TServices, A, E, R>,
  phase: EffectExecutionPhase,
): Promise<A> {
  const runWithExecutionContext = createRunWithExecutionContext(input.tx);
  const executeEffect = options.executeEffect;

  const run = () => {
    if (executeEffect) {
      return executeEffect({
        ...input,
        runWithExecutionContext,
      });
    }

    return runWithExecutionContext(input.effect as Effect.Effect<A, E, never>);
  };

  if (options.instrumentation?.observeEffect) {
    return options.instrumentation.observeEffect(
      {
        ctx: input.ctx,
        effect: input.effect,
        mutation: input.mutation,
        phase,
        tx: input.tx,
      },
      run,
    );
  }

  return run();
}

function createPostCommitTask<TSchema extends ZeroSchema, TContext, TWrappedTransaction, TServices>(
  options: MutationExecutorRuntimeOptions<TContext, TSchema, TWrappedTransaction, TServices>,
  input: {
    readonly ctx: TContext;
    readonly effect: DeferredEffect<TServices>;
    readonly mutation: ServerMutationLike;
  },
): PostCommitTask<TContext, TServices> {
  let runPromise: Promise<void> | undefined;

  return {
    ctx: input.ctx,
    effect: input.effect,
    mutation: input.mutation,
    run: () => {
      if (!runPromise) {
        runPromise = (async () => {
          await executeEffectWithOptions(
            options,
            {
              ctx: input.ctx,
              effect: input.effect,
              mutation: input.mutation,
            },
            "deferred",
          );
        })();
      }

      return runPromise;
    },
  };
}

export function createMutationExecutor<
  TMutators,
  TSchema extends ZeroSchema,
  TContext,
  TWrappedTransaction,
  TServices = EffectMutatorServices<TMutators>,
>(
  options: CreateMutationExecutorOptions<
    TMutators,
    TSchema,
    TContext,
    TWrappedTransaction,
    TServices
  >,
) {
  const postCommitScheduler =
    options.postCommitScheduler ?? createInlinePostCommitScheduler<TContext, TServices>();

  return async <TResponse>(
    input: MutationExecutorInvocation<TSchema, TWrappedTransaction, TResponse>,
  ): Promise<TResponse> => {
    const ctx = await options.getContext(input.mutation);
    const deferredEffects: DeferredEffect<TServices>[] = [];

    const response = await input.runTransaction(
      async (
        tx: ServerTransaction<TSchema, TWrappedTransaction>,
        mutatorName: string,
        mutatorArgs: MutatorArgs,
      ) => {
        const executionState: MutationExecutionState<TServices> = {
          deferredEffects,
          executeEffect: (effect) =>
            executeEffectWithOptions(
              options,
              {
                ctx,
                effect,
                mutation: input.mutation,
                tx,
              },
              "inline",
            ),
        };

        mutationExecutionStateByTransaction.set(tx, executionState);

        try {
          const mutator = mustGetMutator(options.mutators as never, mutatorName) as {
            fn(input: {
              readonly args: MutatorArgs;
              readonly ctx: TContext;
              readonly tx: ServerTransaction<TSchema, TWrappedTransaction>;
            }): Promise<void>;
          };

          const runMutation = () =>
            mutator.fn({
              args: mutatorArgs,
              ctx,
              tx,
            });

          if (options.instrumentation?.observeMutation) {
            await options.instrumentation.observeMutation(
              {
                ctx,
                mutation: input.mutation,
                tx,
              },
              runMutation,
            );
          } else {
            await runMutation();
          }
        } finally {
          mutationExecutionStateByTransaction.delete(tx);
        }
      },
    );

    for (const effect of deferredEffects) {
      await postCommitScheduler(
        createPostCommitTask(options, {
          ctx,
          effect,
          mutation: input.mutation,
        }),
      );
    }

    return response;
  };
}

export function createServerMutatorHandler<
  TMutators,
  TSchema extends ZeroSchema,
  TContext,
  TWrappedTransaction,
  TServices = EffectMutatorServices<TMutators>,
>(
  options: CreateServerMutatorHandlerOptions<
    TMutators,
    TSchema,
    TContext,
    TWrappedTransaction,
    TServices
  >,
) {
  const executeMutation = createMutationExecutor(options);

  return async <TResponse>(
    transact: (
      execute: (
        tx: ServerTransaction<TSchema, TWrappedTransaction>,
        mutatorName: string,
        mutatorArgs: MutatorArgs,
      ) => Promise<void>,
    ) => Promise<TResponse>,
    mutation: ServerMutationLike,
  ): Promise<TResponse> => {
    return executeMutation({
      mutation,
      runTransaction: (execute) => transact(execute),
    });
  };
}

export function createRestMutatorHandler<
  TMutators,
  TSchema extends ZeroSchema,
  TContext,
  TWrappedTransaction,
  TServices = EffectMutatorServices<TMutators>,
>(
  options: CreateServerMutatorHandlerOptions<
    TMutators,
    TSchema,
    TContext,
    TWrappedTransaction,
    TServices
  >,
) {
  const executeMutation = createMutationExecutor(options);

  return async (input: RestMutatorInvocation<TSchema, TWrappedTransaction>) => {
    const mutation: ServerMutationLike = {
      args: input.mutation.args,
      clientID: input.mutation.clientID ?? "rest",
      id: input.mutation.id ?? 0,
      name: input.mutation.name,
    };

    return executeMutation({
      mutation,
      runTransaction: (execute) =>
        input.db.transaction((tx) => execute(tx, mutation.name, mutation.args)),
    });
  };
}
