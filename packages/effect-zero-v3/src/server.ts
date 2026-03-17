import type { ReadonlyJSONValue } from "@rocicorp/zero";
import {
  defineMutatorWithType,
  mustGetMutator,
  type MutatorDefinition,
  type ServerTransaction,
} from "@rocicorp/zero";
import * as Effect from "effect/Effect";

export type { EffectPgConfig, EffectZeroProvider } from "./server/types.js";

type ServerMutationLike = {
  readonly args?: ReadonlyJSONValue;
  readonly clientID: string;
  readonly id: number;
  readonly name: string;
};

export interface RestMutationLike {
  readonly args?: ReadonlyJSONValue;
  readonly clientID?: string;
  readonly id?: number;
  readonly name: string;
}

type DeferredEffect = Effect.Effect<unknown, unknown, unknown>;

type ExecuteEffect = <A, E, R>(effect: Effect.Effect<A, E, R>) => Promise<A>;

interface MutationExecutionState {
  readonly deferredEffects: DeferredEffect[];
  readonly executeEffect: ExecuteEffect;
}

const mutationExecutionStateByTransaction = new WeakMap<object, MutationExecutionState>();

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

type ServerOverrideResult = void | Promise<void> | Effect.Effect<void, unknown, unknown>;

export interface CreateServerMutatorHandlerOptions<
  TMutators,
  TSchema extends import("@rocicorp/zero").Schema,
  TContext,
  TWrappedTransaction,
> {
  readonly getContext: (mutation: ServerMutationLike) => Promise<TContext> | TContext;
  readonly mutators: TMutators;
  readonly executeEffect?: <A, E, R>(input: {
    readonly ctx: TContext;
    readonly effect: Effect.Effect<A, E, R>;
    readonly mutation: ServerMutationLike;
    readonly tx?: ServerTransaction<TSchema, TWrappedTransaction>;
  }) => Promise<A>;
}

export interface RestMutatorTransactionHost {
  transaction<A>(callback: (tx: any) => Promise<A>): Promise<A>;
}

export interface RestMutatorInvocation {
  readonly db: RestMutatorTransactionHost;
  readonly mutation: RestMutationLike;
}

export function extendServerMutator<
  TInput extends ReadonlyJSONValue | undefined,
  TOutput extends ReadonlyJSONValue | undefined,
  TSchema extends import("@rocicorp/zero").Schema,
  TContext,
  TWrappedTransaction,
>(
  baseMutator: MutatorDefinition<TInput, TOutput, TContext, TWrappedTransaction>,
  override: (
    input: ExtendServerMutatorInput<TOutput, TSchema, TContext, TWrappedTransaction>,
  ) => ServerOverrideResult,
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
        "extendServerMutator requires createServerMutatorHandler or createRestMutatorHandler so deferred effects and Effect execution stay request-scoped.",
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

    if (Effect.isEffect(result)) {
      await executionState.executeEffect(result);
      return;
    }

    await result;
  };

  if (baseMutator.validator) {
    return define(baseMutator.validator, runOverride);
  }

  return define(runOverride);
}

async function executeServerMutation<
  TMutators,
  TSchema extends import("@rocicorp/zero").Schema,
  TContext,
  TWrappedTransaction,
  TResponse,
>(
  options: CreateServerMutatorHandlerOptions<TMutators, TSchema, TContext, TWrappedTransaction>,
  input: {
    readonly mutation: ServerMutationLike;
    runTransaction(
      execute: (
        tx: ServerTransaction<TSchema, TWrappedTransaction>,
        mutatorName: string,
        mutatorArgs: ReadonlyJSONValue | undefined,
      ) => Promise<void>,
    ): Promise<TResponse>;
  },
) {
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
          options.executeEffect
            ? options.executeEffect({
                ctx,
                effect,
                mutation: input.mutation,
                tx: serverTx,
              })
            : Effect.runPromise(effect as Effect.Effect<any, any, never>),
      });

      try {
        const mutator = mustGetMutator(options.mutators as never, mutatorName) as {
          fn(input: {
            readonly args: ReadonlyJSONValue | undefined;
            readonly ctx: TContext;
            readonly tx: ServerTransaction<TSchema, TWrappedTransaction>;
          }): Promise<void>;
        };

        await mutator.fn({
          args: mutatorArgs,
          ctx,
          tx: serverTx,
        });
      } finally {
        mutationExecutionStateByTransaction.delete(tx);
      }
    },
  );

  for (const effect of deferredEffects) {
    if (options.executeEffect) {
      await options.executeEffect({
        ctx,
        effect,
        mutation: input.mutation,
        tx: undefined,
      });
      continue;
    }

    await Effect.runPromise(effect as Effect.Effect<any, any, never>);
  }

  return response;
}

export function createServerMutatorHandler<
  TMutators,
  TSchema extends import("@rocicorp/zero").Schema,
  TContext,
  TWrappedTransaction,
>(options: CreateServerMutatorHandlerOptions<TMutators, TSchema, TContext, TWrappedTransaction>) {
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
    return executeServerMutation(options, {
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
  return async (input: RestMutatorInvocation) => {
    const mutation: ServerMutationLike = {
      args: input.mutation.args,
      clientID: input.mutation.clientID ?? "rest",
      id: input.mutation.id ?? 0,
      name: input.mutation.name,
    };

    return executeServerMutation(options, {
      mutation,
      runTransaction: (execute) =>
        input.db.transaction((tx) => execute(tx, mutation.name, mutation.args)),
    });
  };
}
