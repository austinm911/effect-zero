import { defineMutatorWithType, defineMutators, type MutatorDefinition } from "@rocicorp/zero";
import { Effect } from "effect";
import { describe, expect, test } from "vite-plus/test";
import {
  type CreateMutationExecutorOptions,
  createMutationExecutor,
  createWaitUntilPostCommitScheduler,
  extendServerMutator,
  type PostCommitScheduler,
  type ServerMutationLike,
} from "../src/server.js";

type TestContext = {
  readonly requestId: string;
  readonly userId: string;
};

type TestWrappedTransaction = {
  readonly label: string;
  runEffect?<A, E>(effect: Effect.Effect<A, E, never>): Promise<A>;
};

type TestTx = {
  readonly dbTransaction: {
    readonly wrappedTransaction: TestWrappedTransaction;
    runEffect?<A, E>(effect: Effect.Effect<A, E, never>): Promise<A>;
  };
  readonly events: string[];
  readonly location: "server";
};

const define = defineMutatorWithType<any, TestContext, TestWrappedTransaction>();

describe("Effect v3 mutation executor", () => {
  test("runs the direct executor path without deferred work", async () => {
    const tx = createTestTx();
    const executor = createTestExecutor({
      baseMutator: define<{ albumId: string }>(async ({ args, ctx, tx }) => {
        (tx as TestTx).events.push(`base:${ctx.userId}:${args.albumId}`);
      }),
    });

    const response = await runExecutor(executor, { tx });

    expect(response).toEqual({ ok: true });
    expect(tx.events).toEqual(["transaction:start", "base:user-1:album-1", "transaction:commit"]);
  });

  test("runs composed overrides, passes request context into executeEffect, and drains deferred work after commit", async () => {
    const tx = createTestTx();
    const executeEffectInputs: Array<{
      readonly mutation: ServerMutationLike;
      readonly requestId: string;
      readonly txLabel?: string;
    }> = [];
    const executor = createTestExecutor({
      executeEffect: async (input) => {
        executeEffectInputs.push({
          mutation: input.mutation,
          requestId: input.ctx.requestId,
          txLabel: input.tx?.dbTransaction.wrappedTransaction.label,
        });

        return input.runWithExecutionContext(input.effect as Effect.Effect<any, any, never>);
      },
      override: (input) =>
        Effect.gen(function* () {
          (input.tx as TestTx).events.push("override:before-default");
          yield* input.runDefaultMutation();
          (input.tx as TestTx).events.push("override:after-default");
          input.defer(Effect.sync(() => (input.tx as TestTx).events.push("after-commit")));
        }),
    });

    const response = await runExecutor(executor, { tx });

    expect(response).toEqual({ ok: true });
    expect(tx.events).toEqual([
      "transaction:start",
      "override:before-default",
      "base:user-1:album-1",
      "override:after-default",
      "transaction:commit",
      "after-commit",
    ]);
    expect(executeEffectInputs).toEqual([
      {
        mutation: createMutation(),
        requestId: "request-1",
        txLabel: "tx-1",
      },
      {
        mutation: createMutation(),
        requestId: "request-1",
        txLabel: undefined,
      },
    ]);
  });

  test("runWithExecutionContext uses the dbTransaction runner when available", async () => {
    const tx = createTestTx({
      dbTransactionRunEffect: async (effect) => {
        tx.events.push("runner:db");
        return Effect.runPromise(effect);
      },
    });
    const executor = createTestExecutor({
      executeEffect: async (input) =>
        input.runWithExecutionContext(input.effect as Effect.Effect<any, any, never>),
      override: () =>
        Effect.sync(() => {
          tx.events.push("effect:inline");
        }),
    });

    await expect(runExecutor(executor, { tx })).resolves.toEqual({ ok: true });
    expect(tx.events).toEqual([
      "transaction:start",
      "runner:db",
      "effect:inline",
      "transaction:commit",
    ]);
  });

  test("runWithExecutionContext uses the wrappedTransaction runner when available", async () => {
    const tx = createTestTx({
      wrappedTransactionRunEffect: async (effect) => {
        tx.events.push("runner:wrapped");
        return Effect.runPromise(effect);
      },
    });
    const executor = createTestExecutor({
      executeEffect: async (input) =>
        input.runWithExecutionContext(input.effect as Effect.Effect<any, any, never>),
      override: () =>
        Effect.sync(() => {
          tx.events.push("effect:inline");
        }),
    });

    await expect(runExecutor(executor, { tx })).resolves.toEqual({ ok: true });
    expect(tx.events).toEqual([
      "transaction:start",
      "runner:wrapped",
      "effect:inline",
      "transaction:commit",
    ]);
  });

  test("runWithExecutionContext falls back to the default runner when no transaction runner exists", async () => {
    const tx = createTestTx();
    const executor = createTestExecutor({
      executeEffect: async (input) =>
        input.runWithExecutionContext(input.effect as Effect.Effect<any, any, never>),
      override: () =>
        Effect.sync(() => {
          tx.events.push("effect:inline");
        }),
    });

    await expect(runExecutor(executor, { tx })).resolves.toEqual({ ok: true });
    expect(tx.events).toEqual(["transaction:start", "effect:inline", "transaction:commit"]);
  });

  test("supports full replacement overrides without calling runDefaultMutation", async () => {
    const tx = createTestTx();
    const executor = createTestExecutor({
      override: async ({ args, ctx, tx }) => {
        (tx as TestTx).events.push(`replacement:${ctx.userId}:${args.albumId}`);
      },
    });

    await runExecutor(executor, { tx });

    expect(tx.events).toEqual([
      "transaction:start",
      "replacement:user-1:album-1",
      "transaction:commit",
    ]);
  });

  test("rejects double runDefaultMutation and skips post-commit work", async () => {
    const tx = createTestTx();
    const executor = createTestExecutor({
      override: (input) =>
        Effect.gen(function* () {
          input.defer(Effect.sync(() => (input.tx as TestTx).events.push("after-commit")));
          yield* input.runDefaultMutation();
          yield* input.runDefaultMutation();
        }),
    });

    await expect(runExecutor(executor, { tx })).rejects.toThrow(
      "runDefaultMutation() may only be called once per server mutation.",
    );
    expect(tx.events).toEqual(["transaction:start", "base:user-1:album-1"]);
  });

  test("does not run deferred work when the transaction host fails before commit", async () => {
    const tx = createTestTx();
    const executor = createTestExecutor({
      override: (input) =>
        Effect.gen(function* () {
          yield* input.runDefaultMutation();
          input.defer(Effect.sync(() => (input.tx as TestTx).events.push("after-commit")));
        }),
    });

    await expect(
      executor({
        mutation: createMutation(),
        runTransaction: async (execute) => {
          tx.events.push("transaction:start");
          await execute(tx as any, "cart.add", createMutation().args);
          tx.events.push("transaction:rollback");
          throw new Error("commit failed");
        },
      }),
    ).rejects.toThrow("commit failed");
    expect(tx.events).toEqual(["transaction:start", "base:user-1:album-1", "transaction:rollback"]);
  });

  test("inline scheduling waits for deferred work to finish", async () => {
    const tx = createTestTx();
    const deferred = createDeferred<void>();
    const executor = createTestExecutor({
      override: (input) =>
        Effect.gen(function* () {
          yield* input.runDefaultMutation();
          input.defer(
            Effect.tryPromise(async () => {
              await deferred.promise;
              (input.tx as TestTx).events.push("after-commit");
            }),
          );
        }),
    });

    let didResolve = false;
    const resultPromise = runExecutor(executor, { tx }).then((result) => {
      didResolve = true;
      return result;
    });

    await flushMicrotasks();
    expect(didResolve).toBe(false);
    expect(tx.events).toContain("transaction:start");
    expect(tx.events).toContain("base:user-1:album-1");
    expect(tx.events).not.toContain("after-commit");

    deferred.resolve();
    await expect(resultPromise).resolves.toEqual({ ok: true });
    expect(tx.events).toEqual([
      "transaction:start",
      "base:user-1:album-1",
      "transaction:commit",
      "after-commit",
    ]);
  });

  test("waitUntil scheduling returns before deferred work settles", async () => {
    const tx = createTestTx();
    const deferred = createDeferred<void>();
    const backgroundPromises: Promise<unknown>[] = [];
    const executor = createTestExecutor({
      override: (input) =>
        Effect.gen(function* () {
          yield* input.runDefaultMutation();
          input.defer(
            Effect.tryPromise(async () => {
              await deferred.promise;
              (input.tx as TestTx).events.push("after-commit");
            }),
          );
        }),
      postCommitScheduler: createWaitUntilPostCommitScheduler({
        onDeferredError: () => {
          throw new Error("onDeferredError should not run");
        },
        waitUntil: (promise) => {
          backgroundPromises.push(promise);
        },
      }),
    });

    await expect(runExecutor(executor, { tx })).resolves.toEqual({ ok: true });
    expect(backgroundPromises).toHaveLength(1);
    expect(tx.events).toEqual(["transaction:start", "base:user-1:album-1", "transaction:commit"]);

    deferred.resolve();
    await backgroundPromises[0];
    expect(tx.events).toEqual([
      "transaction:start",
      "base:user-1:album-1",
      "transaction:commit",
      "after-commit",
    ]);
  });

  test("surfaces scheduler handoff failures immediately", async () => {
    const tx = createTestTx();
    const executor = createTestExecutor({
      override: (input) =>
        Effect.gen(function* () {
          yield* input.runDefaultMutation();
          input.defer(Effect.sync(() => (input.tx as TestTx).events.push("after-commit")));
        }),
      postCommitScheduler: async () => {
        throw new Error("scheduler handoff failed");
      },
    });

    await expect(runExecutor(executor, { tx })).rejects.toThrow("scheduler handoff failed");
    expect(tx.events).toEqual(["transaction:start", "base:user-1:album-1", "transaction:commit"]);
  });

  test("runs each post-commit task at most once even if a custom scheduler calls run twice", async () => {
    const tx = createTestTx();
    const executor = createTestExecutor({
      override: (input) =>
        Effect.gen(function* () {
          yield* input.runDefaultMutation();
          input.defer(Effect.sync(() => (input.tx as TestTx).events.push("after-commit")));
        }),
      postCommitScheduler: async (task) => {
        await task.run();
        await task.run();
      },
    });

    await expect(runExecutor(executor, { tx })).resolves.toEqual({ ok: true });
    expect(tx.events).toEqual([
      "transaction:start",
      "base:user-1:album-1",
      "transaction:commit",
      "after-commit",
    ]);
  });

  test("reports deferred failures through onDeferredError when using waitUntil", async () => {
    const tx = createTestTx();
    const backgroundPromises: Promise<unknown>[] = [];
    const deferredErrors: Array<{ readonly message: string; readonly mutationName: string }> = [];
    const executor = createTestExecutor({
      override: (input) =>
        Effect.gen(function* () {
          yield* input.runDefaultMutation();
          input.defer(
            Effect.fail(new Error("background boom")) as Effect.Effect<void, Error, never>,
          );
        }),
      postCommitScheduler: createWaitUntilPostCommitScheduler({
        onDeferredError: ({ error, task }) => {
          deferredErrors.push({
            message: error instanceof Error ? error.message : String(error),
            mutationName: task.mutation.name,
          });
        },
        waitUntil: (promise) => {
          backgroundPromises.push(promise);
        },
      }),
    });

    await expect(runExecutor(executor, { tx })).resolves.toEqual({ ok: true });
    expect(backgroundPromises).toHaveLength(1);

    await backgroundPromises[0];
    expect(deferredErrors).toEqual([{ message: "background boom", mutationName: "cart.add" }]);
  });

  test("supports app-owned error mapping in custom shells", async () => {
    const tx = createTestTx();
    const executor = createTestExecutor({
      baseMutator: define<{ albumId: string }>(async () => {
        throw new Error("route failure");
      }),
    });

    const response = await (async () => {
      try {
        await runExecutor(executor, { tx });
        return { status: 200 as const };
      } catch (error) {
        return {
          status: 409 as const,
          message: error instanceof Error ? error.message : String(error),
        };
      }
    })();

    expect(response).toEqual({
      message: "route failure",
      status: 409,
    });
  });

  test("wraps mutation execution with instrumentation hooks on success and failure", async () => {
    const successTx = createTestTx();
    const failureTx = createTestTx();
    const calls: string[] = [];

    const successExecutor = createTestExecutor({
      instrumentation: {
        observeMutation: async (input, run) => {
          calls.push(
            `mutation:start:${input.mutation.name}:${input.tx.dbTransaction.wrappedTransaction.label}`,
          );
          try {
            const result = await run();
            calls.push(`mutation:success:${input.mutation.id}`);
            return result;
          } catch (error) {
            calls.push(`mutation:error:${error instanceof Error ? error.message : String(error)}`);
            throw error;
          }
        },
      },
    });

    const failureExecutor = createTestExecutor({
      baseMutator: define<{ albumId: string }>(async () => {
        throw new Error("mutation boom");
      }),
      instrumentation: {
        observeMutation: async (input, run) => {
          calls.push(
            `mutation:start:${input.mutation.name}:${input.tx.dbTransaction.wrappedTransaction.label}`,
          );
          try {
            const result = await run();
            calls.push(`mutation:success:${input.mutation.id}`);
            return result;
          } catch (error) {
            calls.push(`mutation:error:${error instanceof Error ? error.message : String(error)}`);
            throw error;
          }
        },
      },
    });

    await expect(runExecutor(successExecutor, { tx: successTx })).resolves.toEqual({ ok: true });
    await expect(runExecutor(failureExecutor, { tx: failureTx })).rejects.toThrow("mutation boom");

    expect(calls).toEqual([
      "mutation:start:cart.add:tx-1",
      "mutation:success:1",
      "mutation:start:cart.add:tx-1",
      "mutation:error:mutation boom",
    ]);
  });

  test("wraps inline and deferred effect execution with instrumentation hooks", async () => {
    const tx = createTestTx();
    const calls: string[] = [];
    const executor = createTestExecutor({
      instrumentation: {
        observeEffect: async (input, run) => {
          calls.push(
            `effect:${input.phase}:${input.tx?.dbTransaction.wrappedTransaction.label ?? "none"}`,
          );
          return run();
        },
      },
      override: (input) =>
        Effect.gen(function* () {
          yield* Effect.sync(() => {
            calls.push("effect:inline:body");
          });
          input.defer(
            Effect.sync(() => {
              calls.push("effect:deferred:body");
            }),
          );
        }),
    });

    await expect(runExecutor(executor, { tx })).resolves.toEqual({ ok: true });
    expect(calls).toEqual([
      "effect:inline:tx-1",
      "effect:inline:body",
      "effect:deferred:none",
      "effect:deferred:body",
    ]);
  });
});

function createDeferred<T>() {
  let reject!: (reason?: unknown) => void;
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    reject = rejectPromise;
    resolve = resolvePromise;
  });

  return {
    promise,
    reject,
    resolve,
  };
}

function createMutation(): ServerMutationLike {
  return {
    args: {
      albumId: "album-1",
    },
    clientID: "client-1",
    id: 1,
    name: "cart.add",
  };
}

function createTestExecutor(options?: {
  readonly baseMutator?: MutatorDefinition<
    { albumId: string },
    { albumId: string },
    TestContext,
    TestWrappedTransaction
  >;
  readonly executeEffect?: CreateMutationExecutorOptions<
    any,
    any,
    TestContext,
    TestWrappedTransaction
  >["executeEffect"];
  readonly instrumentation?: CreateMutationExecutorOptions<
    any,
    any,
    TestContext,
    TestWrappedTransaction
  >["instrumentation"];
  readonly override?: Parameters<
    typeof extendServerMutator<
      { albumId: string },
      { albumId: string },
      any,
      TestContext,
      TestWrappedTransaction
    >
  >[1];
  readonly postCommitScheduler?: PostCommitScheduler<TestContext>;
}) {
  const baseMutator =
    options?.baseMutator ??
    define<{ albumId: string }>(async ({ args, ctx, tx }) => {
      (tx as TestTx).events.push(`base:${ctx.userId}:${args.albumId}`);
    });
  const mutators = defineMutators({
    cart: {
      add: options?.override ? extendServerMutator(baseMutator, options.override) : baseMutator,
    },
  });

  return createMutationExecutor({
    executeEffect: options?.executeEffect,
    getContext: (mutation) => ({
      requestId: `request-${mutation.id}`,
      userId: "user-1",
    }),
    instrumentation: options?.instrumentation,
    mutators,
    postCommitScheduler: options?.postCommitScheduler,
  });
}

function createTestTx(options?: {
  readonly dbTransactionRunEffect?: TestTx["dbTransaction"]["runEffect"];
  readonly wrappedTransactionRunEffect?: TestWrappedTransaction["runEffect"];
}): TestTx {
  const wrappedTransaction: TestWrappedTransaction = {
    label: "tx-1",
    ...(options?.wrappedTransactionRunEffect
      ? {
          runEffect: options.wrappedTransactionRunEffect,
        }
      : {}),
  };

  return {
    dbTransaction: {
      wrappedTransaction,
      ...(options?.dbTransactionRunEffect
        ? {
            runEffect: options.dbTransactionRunEffect,
          }
        : {}),
    },
    events: [],
    location: "server",
  };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

async function runExecutor(
  executor: ReturnType<typeof createTestExecutor>,
  options?: {
    readonly mutation?: ServerMutationLike;
    readonly tx?: TestTx;
  },
) {
  const mutation = options?.mutation ?? createMutation();
  const tx = options?.tx ?? createTestTx();

  return executor({
    mutation,
    runTransaction: async (execute) => {
      tx.events.push("transaction:start");
      await execute(tx as any, mutation.name, mutation.args);
      tx.events.push("transaction:commit");
      return { ok: true } as const;
    },
  });
}
