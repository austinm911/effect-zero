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

type DeferredEffect = Effect.Effect<unknown, unknown, unknown>;

interface MutationExecutionState {
  readonly deferredEffects: DeferredEffect[];
  readonly executeEffect: (effect: DeferredEffect) => Promise<unknown>;
}

const mutationExecutionStateByTransaction = new WeakMap<object, MutationExecutionState>();

export interface ExecuteEffectInput<
  TContext,
  TSchema extends import("@rocicorp/zero").Schema,
  TWrappedTransaction,
  A,
  E,
  R,
> {
  readonly ctx: TContext;
  readonly effect: Effect.Effect<A, E, R>;
  readonly mutation: ServerMutationLike;
  runWithExecutionContext<A2, E2>(effect: Effect.Effect<A2, E2, never>): Promise<A2>;
  readonly tx?: ServerTransaction<TSchema, TWrappedTransaction>;
}

export type EffectExecutionPhase = "inline" | "deferred";

export interface ObserveMutationInput<
  TContext,
  TSchema extends import("@rocicorp/zero").Schema,
  TWrappedTransaction,
> {
  readonly ctx: TContext;
  readonly mutation: ServerMutationLike;
  readonly tx: ServerTransaction<TSchema, TWrappedTransaction>;
}

export interface ObserveEffectInput<
  TContext,
  TSchema extends import("@rocicorp/zero").Schema,
  TWrappedTransaction,
  A,
  E,
  R,
> {
  readonly ctx: TContext;
  readonly effect: Effect.Effect<A, E, R>;
  readonly mutation: ServerMutationLike;
  readonly phase: EffectExecutionPhase;
  readonly tx?: ServerTransaction<TSchema, TWrappedTransaction>;
}

export interface MutationExecutorInstrumentation<
  TContext,
  TSchema extends import("@rocicorp/zero").Schema,
  TWrappedTransaction,
> {
  observeMutation?<A>(
    input: ObserveMutationInput<TContext, TSchema, TWrappedTransaction>,
    run: () => Promise<A>,
  ): Promise<A>;
  observeEffect?<A, E, R>(
    input: ObserveEffectInput<TContext, TSchema, TWrappedTransaction, A, E, R>,
    run: () => Promise<A>,
  ): Promise<A>;
}

export interface PostCommitTask<TContext> {
  readonly ctx: TContext;
  readonly effect: DeferredEffect;
  readonly mutation: ServerMutationLike;
  run(): Promise<void>;
}

export type PostCommitScheduler<TContext> = (task: PostCommitTask<TContext>) => Promise<void>;

export interface CreateMutationExecutorOptions<
  TMutators,
  TSchema extends import("@rocicorp/zero").Schema,
  TContext,
  TWrappedTransaction,
> {
  readonly getContext: (mutation: ServerMutationLike) => Promise<TContext> | TContext;
  readonly mutators: TMutators;
  readonly executeEffect?: <A, E, R>(
    input: ExecuteEffectInput<TContext, TSchema, TWrappedTransaction, A, E, R>,
  ) => Promise<A>;
  readonly instrumentation?: MutationExecutorInstrumentation<
    TContext,
    TSchema,
    TWrappedTransaction
  >;
  readonly postCommitScheduler?: PostCommitScheduler<TContext>;
}

export type CreateServerMutatorHandlerOptions<
  TMutators,
  TSchema extends import("@rocicorp/zero").Schema,
  TContext,
  TWrappedTransaction,
> = CreateMutationExecutorOptions<TMutators, TSchema, TContext, TWrappedTransaction>;

export interface MutationExecutorInvocation<
  TSchema extends import("@rocicorp/zero").Schema,
  TWrappedTransaction,
  TResponse,
> {
  readonly mutation: ServerMutationLike;
  runTransaction(
    execute: (
      tx: ServerTransaction<TSchema, TWrappedTransaction>,
      mutatorName: string,
      mutatorArgs: ReadonlyJSONValue | undefined,
    ) => Promise<void>,
  ): Promise<TResponse>;
}

export interface RestMutatorTransactionHost {
  transaction<A>(callback: (tx: any) => Promise<A>): Promise<A>;
}

export interface RestMutatorInvocation {
  readonly db: RestMutatorTransactionHost;
  readonly mutation: RestMutationLike;
}

export interface ExtendServerMutatorInput<
  TArgs extends ReadonlyJSONValue | undefined,
  TSchema extends import("@rocicorp/zero").Schema,
  TContext,
  TWrappedTransaction,
> {
  readonly args: TArgs;
  readonly ctx: TContext;
  readonly tx: ServerTransaction<TSchema, TWrappedTransaction>;
  defer(effect: DeferredEffect): void;
  runDefaultMutation(): Effect.Effect<void, unknown, never>;
}

export type ServerOverrideResult = void | Promise<void> | Effect.Effect<void, unknown, unknown>;
export type ServerEffectMutatorResult =
  | void
  | Promise<void>
  | Effect.Effect<void, unknown, unknown>;

type StandardSchemaLike = StandardSchemaV1<any, any>;

type InferStandardSchemaInput<TValidator extends StandardSchemaLike> =
  TValidator extends StandardSchemaV1<infer TInput, any>
    ? Extract<TInput, ReadonlyJSONValue | undefined>
    : never;

type InferStandardSchemaOutput<TValidator extends StandardSchemaLike> =
  TValidator extends StandardSchemaV1<any, infer TOutput>
    ? Extract<TOutput, ReadonlyJSONValue | undefined>
    : never;

export type ServerMutatorDefinitionFunction<
  TOutput extends ReadonlyJSONValue | undefined,
  TContext,
  TWrappedTransaction,
  TSchema extends ZeroSchema,
> = (input: {
  readonly args: TOutput;
  readonly ctx: TContext;
  readonly tx: Transaction<TSchema, TWrappedTransaction>;
}) => Promise<void>;

export type EffectMutatorDefinitionFunction<
  TOutput extends ReadonlyJSONValue | undefined,
  TContext,
  TWrappedTransaction,
  TSchema extends ZeroSchema,
> = (input: {
  readonly args: TOutput;
  readonly ctx: TContext;
  defer(effect: DeferredEffect): void;
  readonly tx: Transaction<TSchema, TWrappedTransaction>;
}) => ServerEffectMutatorResult;

export type TypedDefineServerMutator<TSchema extends ZeroSchema, TContext, TWrappedTransaction> = {
  <TArgs extends ReadonlyJSONValue | undefined>(
    mutator: ServerMutatorDefinitionFunction<TArgs, TContext, TWrappedTransaction, TSchema>,
  ): MutatorDefinition<TArgs, TArgs, TContext, TWrappedTransaction>;

  <TValidator extends StandardSchemaLike>(
    validator: TValidator,
    mutator: ServerMutatorDefinitionFunction<
      InferStandardSchemaOutput<TValidator>,
      TContext,
      TWrappedTransaction,
      TSchema
    >,
  ): MutatorDefinition<
    InferStandardSchemaInput<TValidator>,
    InferStandardSchemaOutput<TValidator>,
    TContext,
    TWrappedTransaction
  >;
};

export type TypedDefineEffectMutator<TSchema extends ZeroSchema, TContext, TWrappedTransaction> = {
  <TArgs extends ReadonlyJSONValue | undefined>(
    mutator: EffectMutatorDefinitionFunction<TArgs, TContext, TWrappedTransaction, TSchema>,
  ): MutatorDefinition<TArgs, TArgs, TContext, TWrappedTransaction>;

  <TValidator extends StandardSchemaLike>(
    validator: TValidator,
    mutator: EffectMutatorDefinitionFunction<
      InferStandardSchemaOutput<TValidator>,
      TContext,
      TWrappedTransaction,
      TSchema
    >,
  ): MutatorDefinition<
    InferStandardSchemaInput<TValidator>,
    InferStandardSchemaOutput<TValidator>,
    TContext,
    TWrappedTransaction
  >;
};

export type ExtendServerMutatorOverride<
  TOutput extends ReadonlyJSONValue | undefined,
  TSchema extends import("@rocicorp/zero").Schema,
  TContext,
  TWrappedTransaction,
> = (
  input: ExtendServerMutatorInput<TOutput, TSchema, TContext, TWrappedTransaction>,
) => ServerOverrideResult;

export type TypedExtendServerMutator<TSchema extends ZeroSchema, TContext, TWrappedTransaction> = <
  TBaseMutator extends MutatorDefinition<any, any, any, any>,
>(
  baseMutator: TBaseMutator,
  override: ExtendServerMutatorOverride<
    TBaseMutator["~"]["$output"],
    TSchema,
    TContext,
    TWrappedTransaction
  >,
) => MutatorDefinition<
  TBaseMutator["~"]["$input"],
  TBaseMutator["~"]["$output"],
  TContext,
  TWrappedTransaction
>;

export function defineServerMutatorWithType<
  TSchema extends ZeroSchema,
  TContext,
  TWrappedTransaction,
>(): TypedDefineServerMutator<TSchema, TContext, TWrappedTransaction> {
  return defineMutatorWithType<
    TSchema,
    TContext,
    TWrappedTransaction
  >() as unknown as TypedDefineServerMutator<TSchema, TContext, TWrappedTransaction>;
}

function executeServerEffectResult<
  TSchema extends import("@rocicorp/zero").Schema,
  TWrappedTransaction,
>(
  tx: import("@rocicorp/zero").Transaction<TSchema, TWrappedTransaction>,
  result: ServerEffectMutatorResult,
  apiName: "defineEffectMutatorWithType" | "extendServerMutator",
) {
  if (!Effect.isEffect(result)) {
    return Promise.resolve(result);
  }

  if (tx.location !== "server") {
    throw new Error(`${apiName} may only run on the authoritative server path.`);
  }

  const executionState = mutationExecutionStateByTransaction.get(tx);

  if (!executionState) {
    throw new Error(
      `${apiName} requires createMutationExecutor, createServerMutatorHandler, or createRestMutatorHandler so deferred effects and Effect execution stay request-scoped.`,
    );
  }

  return executionState.executeEffect(result);
}

export function defineEffectMutatorWithType<
  TSchema extends ZeroSchema,
  TContext,
  TWrappedTransaction,
>(): TypedDefineEffectMutator<TSchema, TContext, TWrappedTransaction> {
  const define = defineMutatorWithType<TSchema, TContext, TWrappedTransaction>();

  function wrapMutator<TOutput extends ReadonlyJSONValue | undefined>(
    mutator: EffectMutatorDefinitionFunction<TOutput, TContext, TWrappedTransaction, TSchema>,
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
      const defer = (effect: DeferredEffect) => {
        if (tx.location !== "server") {
          throw new Error(
            "defineEffectMutatorWithType may only run on the authoritative server path.",
          );
        }

        const executionState = mutationExecutionStateByTransaction.get(tx);

        if (!executionState) {
          throw new Error(
            "defineEffectMutatorWithType requires createMutationExecutor, createServerMutatorHandler, or createRestMutatorHandler so deferred effects and Effect execution stay request-scoped.",
          );
        }

        executionState.deferredEffects.push(effect);
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

  function defineTypedEffectMutator<
    TValidator extends StandardSchemaLike,
    TInput extends ReadonlyJSONValue | undefined,
    TOutput extends ReadonlyJSONValue | undefined,
  >(
    validatorOrMutator:
      | TValidator
      | EffectMutatorDefinitionFunction<any, TContext, TWrappedTransaction, TSchema>,
    maybeMutator?: EffectMutatorDefinitionFunction<TOutput, TContext, TWrappedTransaction, TSchema>,
  ) {
    if (typeof maybeMutator === "function") {
      return define(validatorOrMutator as unknown as any, wrapMutator(maybeMutator));
    }

    return define(
      wrapMutator(
        validatorOrMutator as EffectMutatorDefinitionFunction<
          TInput,
          TContext,
          TWrappedTransaction,
          TSchema
        >,
      ),
    );
  }

  return defineTypedEffectMutator as TypedDefineEffectMutator<
    TSchema,
    TContext,
    TWrappedTransaction
  >;
}

export function createInlinePostCommitScheduler<TContext>(): PostCommitScheduler<TContext> {
  return async (task) => {
    await task.run();
  };
}

export function createWaitUntilPostCommitScheduler<TContext>(options: {
  readonly onDeferredError: (input: {
    readonly error: unknown;
    readonly task: PostCommitTask<TContext>;
  }) => void | Promise<void>;
  readonly waitUntil: (promise: Promise<unknown>) => void;
}): PostCommitScheduler<TContext> {
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
  TInput extends ReadonlyJSONValue | undefined,
  TOutput extends ReadonlyJSONValue | undefined,
  TSchema extends import("@rocicorp/zero").Schema,
  TContext,
  TWrappedTransaction,
>(
  baseMutator: MutatorDefinition<TInput, TOutput, TContext, TWrappedTransaction>,
  override: ExtendServerMutatorOverride<TOutput, TSchema, TContext, TWrappedTransaction>,
) {
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
    if (tx.location !== "server") {
      throw new Error("extendServerMutator may only run on the authoritative server path.");
    }

    const executionState = mutationExecutionStateByTransaction.get(tx);

    if (!executionState) {
      throw new Error(
        "extendServerMutator requires createMutationExecutor, createServerMutatorHandler, or createRestMutatorHandler so deferred effects and Effect execution stay request-scoped.",
      );
    }

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
              tx,
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
      tx,
    });

    await executeServerEffectResult(tx, result, "extendServerMutator");
  };

  if (baseMutator.validator) {
    return define(baseMutator.validator, runOverride);
  }

  return define(runOverride);
}

export function extendServerMutatorWithType<
  TSchema extends ZeroSchema,
  TContext,
  TWrappedTransaction,
>(): TypedExtendServerMutator<TSchema, TContext, TWrappedTransaction> {
  return function extendTypedServerMutator<
    TBaseMutator extends MutatorDefinition<any, any, any, any>,
  >(
    baseMutator: TBaseMutator,
    override: ExtendServerMutatorOverride<
      TBaseMutator["~"]["$output"],
      TSchema,
      TContext,
      TWrappedTransaction
    >,
  ): MutatorDefinition<
    TBaseMutator["~"]["$input"],
    TBaseMutator["~"]["$output"],
    TContext,
    TWrappedTransaction
  > {
    const serverBaseMutator = baseMutator as unknown as MutatorDefinition<
      TBaseMutator["~"]["$input"],
      TBaseMutator["~"]["$output"],
      TContext,
      TWrappedTransaction
    >;

    return extendServerMutator<
      TBaseMutator["~"]["$input"],
      TBaseMutator["~"]["$output"],
      TSchema,
      TContext,
      TWrappedTransaction
    >(serverBaseMutator, override) as MutatorDefinition<
      TBaseMutator["~"]["$input"],
      TBaseMutator["~"]["$output"],
      TContext,
      TWrappedTransaction
    >;
  };
}

export function extendEffectMutatorWithType<
  TSchema extends ZeroSchema,
  TContext,
  TWrappedTransaction,
>(): TypedExtendServerMutator<TSchema, TContext, TWrappedTransaction> {
  return extendServerMutatorWithType<TSchema, TContext, TWrappedTransaction>();
}

interface EffectExecutionRunner {
  runEffect<A, E>(effect: Effect.Effect<A, E, never>): Promise<A>;
}

function hasEffectExecutionRunner(value: unknown): value is EffectExecutionRunner {
  return (
    typeof value === "object" &&
    value !== null &&
    "runEffect" in value &&
    typeof (value as { runEffect?: unknown }).runEffect === "function"
  );
}

function getWrappedTransaction(value: unknown): unknown {
  if (typeof value !== "object" || value === null || !("wrappedTransaction" in value)) {
    return undefined;
  }

  return (value as { readonly wrappedTransaction?: unknown }).wrappedTransaction;
}

function getEffectExecutionRunner(value: unknown): EffectExecutionRunner | undefined {
  if (hasEffectExecutionRunner(value)) {
    return value;
  }

  const wrappedTransaction = getWrappedTransaction(value);
  return hasEffectExecutionRunner(wrappedTransaction) ? wrappedTransaction : undefined;
}

function resolveTransactionEffectRunner<
  TSchema extends import("@rocicorp/zero").Schema,
  TWrappedTransaction,
>(tx?: ServerTransaction<TSchema, TWrappedTransaction>) {
  const dbTransaction = (tx as { readonly dbTransaction?: unknown } | undefined)?.dbTransaction;
  return getEffectExecutionRunner(dbTransaction);
}

function createRunWithExecutionContext<
  TSchema extends import("@rocicorp/zero").Schema,
  TWrappedTransaction,
>(tx?: ServerTransaction<TSchema, TWrappedTransaction>) {
  const transactionRunner = resolveTransactionEffectRunner(tx);
  return <A, E>(effect: Effect.Effect<A, E, never>) =>
    transactionRunner ? transactionRunner.runEffect(effect) : Effect.runPromise(effect);
}

function executeEffectWithOptions<
  TMutators,
  TSchema extends import("@rocicorp/zero").Schema,
  TContext,
  TWrappedTransaction,
  A,
  E,
  R,
>(
  options: CreateMutationExecutorOptions<TMutators, TSchema, TContext, TWrappedTransaction>,
  input: ExecuteEffectInput<TContext, TSchema, TWrappedTransaction, A, E, R>,
  phase: EffectExecutionPhase,
): Promise<A> {
  const runWithExecutionContext = createRunWithExecutionContext(input.tx);

  const run = () => {
    if (options.executeEffect) {
      return options.executeEffect({
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

function createPostCommitTask<
  TMutators,
  TSchema extends import("@rocicorp/zero").Schema,
  TContext,
  TWrappedTransaction,
>(
  options: CreateMutationExecutorOptions<TMutators, TSchema, TContext, TWrappedTransaction>,
  input: {
    readonly ctx: TContext;
    readonly effect: DeferredEffect;
    readonly mutation: ServerMutationLike;
  },
): PostCommitTask<TContext> {
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
              tx: undefined,
              runWithExecutionContext: (effect) => Effect.runPromise(effect),
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
  TSchema extends import("@rocicorp/zero").Schema,
  TContext,
  TWrappedTransaction,
>(options: CreateMutationExecutorOptions<TMutators, TSchema, TContext, TWrappedTransaction>) {
  const postCommitScheduler =
    options.postCommitScheduler ?? createInlinePostCommitScheduler<TContext>();

  return async <TResponse>(
    input: MutationExecutorInvocation<TSchema, TWrappedTransaction, TResponse>,
  ): Promise<TResponse> => {
    const ctx = await options.getContext(input.mutation);
    const deferredEffects: DeferredEffect[] = [];

    const response = await input.runTransaction(
      async (
        tx: ServerTransaction<TSchema, TWrappedTransaction>,
        mutatorName: string,
        mutatorArgs: ReadonlyJSONValue | undefined,
      ) => {
        const serverTx = tx as ServerTransaction<TSchema, TWrappedTransaction>;

        mutationExecutionStateByTransaction.set(tx, {
          deferredEffects,
          executeEffect: (effect) =>
            executeEffectWithOptions(
              options,
              {
                ctx,
                effect,
                mutation: input.mutation,
                tx: serverTx,
                runWithExecutionContext: createRunWithExecutionContext(serverTx),
              },
              "inline",
            ),
        });

        try {
          const mutator = mustGetMutator(options.mutators as never, mutatorName) as {
            fn(input: {
              readonly args: ReadonlyJSONValue | undefined;
              readonly ctx: TContext;
              readonly tx: ServerTransaction<TSchema, TWrappedTransaction>;
            }): Promise<void>;
          };

          const runMutation = () =>
            mutator.fn({
              args: mutatorArgs,
              ctx,
              tx: serverTx,
            });

          if (options.instrumentation?.observeMutation) {
            await options.instrumentation.observeMutation(
              {
                ctx,
                mutation: input.mutation,
                tx: serverTx,
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
  TSchema extends import("@rocicorp/zero").Schema,
  TContext,
  TWrappedTransaction,
>(options: CreateServerMutatorHandlerOptions<TMutators, TSchema, TContext, TWrappedTransaction>) {
  const executeMutation = createMutationExecutor(options);

  return async <TResponse>(
    transact: (
      execute: (
        tx: any,
        mutatorName: string,
        mutatorArgs: ReadonlyJSONValue | undefined,
      ) => Promise<void>,
    ) => Promise<TResponse>,
    mutation: ServerMutationLike,
  ): Promise<TResponse> => {
    return executeMutation({
      mutation,
      runTransaction: (execute) => transact((tx, name, args) => execute(tx, name, args)),
    });
  };
}

export function createRestMutatorHandler<
  TMutators,
  TSchema extends import("@rocicorp/zero").Schema,
  TContext,
  TWrappedTransaction,
>(options: CreateServerMutatorHandlerOptions<TMutators, TSchema, TContext, TWrappedTransaction>) {
  const executeMutation = createMutationExecutor(options);

  return async (input: RestMutatorInvocation) => {
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
