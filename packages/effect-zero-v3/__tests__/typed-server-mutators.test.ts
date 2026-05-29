import {
  defineMutator,
  defineMutators,
  type MutatorDefinition,
  type ReadonlyJSONValue,
} from "@rocicorp/zero";
import { Effect } from "effect";
import { describe, expect, test } from "vite-plus/test";
import {
  createMutationExecutor,
  defineEffectMutatorWithType,
  defineServerMutatorWithType,
  extendServerMutatorWithType,
  type ServerMutationLike,
} from "../src/server.js";

type TestContext = {
  readonly userId: string;
};

type TestWrappedTransaction = {
  readonly label: string;
};

type TestTx = {
  readonly dbTransaction: {
    readonly wrappedTransaction: TestWrappedTransaction;
  };
  readonly events: string[];
  readonly location: "server";
};

const defineServerMutator = defineServerMutatorWithType<any, TestContext, TestWrappedTransaction>();
const defineEffectMutator = defineEffectMutatorWithType<any, TestContext, TestWrappedTransaction>();
const extendTypedServerMutator = extendServerMutatorWithType<
  any,
  TestContext,
  TestWrappedTransaction
>();

describe("Effect v3 typed server mutator helpers", () => {
  test("binds a server-only define helper to app context and wrapped transaction types", async () => {
    const tx = createTestTx();

    const mutator = defineServerMutator<{ albumId: string }>(async ({ args, ctx, tx }) => {
      (tx as TestTx).events.push(
        `defined:${ctx.userId}:${args.albumId}:${tx.dbTransaction.wrappedTransaction.label}`,
      );
    });

    await mutator.fn({
      args: {
        albumId: "album-1",
      },
      ctx: {
        userId: "user-1",
      },
      tx: tx as any,
    });

    expect(tx.events).toEqual(["defined:user-1:album-1:tx-1"]);
  });

  test("rebinds a client mutator into a typed server override", async () => {
    const tx = createTestTx();

    const clientMutator = defineMutator<{ albumId: string }>(async ({ args }) => {
      tx.events.push(`base:${args.albumId}`);
    });

    const serverMutator: MutatorDefinition<
      { albumId: string },
      { albumId: string },
      TestContext,
      TestWrappedTransaction
    > = extendTypedServerMutator(clientMutator, (input) =>
      Effect.gen(function* () {
        tx.events.push(
          `override:${input.ctx.userId}:${input.tx.dbTransaction.wrappedTransaction.label}`,
        );
        yield* input.runDefaultMutation();
        input.defer(
          Effect.sync(() => {
            tx.events.push(`after-commit:${input.args.albumId}`);
          }),
        );
      }),
    );

    const executeMutation = createMutationExecutor({
      getContext: () => ({
        userId: "user-1",
      }),
      mutators: defineMutators({
        cart: {
          add: serverMutator,
        },
      }),
    });

    const result = await executeMutation({
      mutation: createMutation(),
      runTransaction: async (execute) => {
        tx.events.push("transaction:start");
        await execute(tx as any, "cart.add", createMutation().args);
        tx.events.push("transaction:commit");
        return "ok";
      },
    });

    expect(result).toBe("ok");
    expect(tx.events).toEqual([
      "transaction:start",
      "override:user-1:tx-1",
      "base:album-1",
      "transaction:commit",
      "after-commit:album-1",
    ]);
  });

  test("runs declarative Effect definitions through the shared executor", async () => {
    const tx = createTestTx();

    const mutator = defineEffectMutator<{ albumId: string }>((input) =>
      Effect.gen(function* () {
        tx.events.push(`before:${input.ctx.userId}:${input.args.albumId}`);
        yield* Effect.sync(() => {
          tx.events.push(`during:${input.tx.dbTransaction.wrappedTransaction.label}`);
        });
      }),
    );

    const executeMutation = createMutationExecutor({
      getContext: () => ({
        userId: "user-1",
      }),
      mutators: defineMutators({
        cart: {
          add: mutator,
        },
      }),
    });

    await executeMutation({
      mutation: createMutation(),
      runTransaction: async (execute) => {
        tx.events.push("transaction:start");
        await execute(tx as any, "cart.add", createMutation().args);
        tx.events.push("transaction:commit");
        return undefined;
      },
    });

    expect(tx.events).toEqual([
      "transaction:start",
      "before:user-1:album-1",
      "during:tx-1",
      "transaction:commit",
    ]);
  });

  test("threads typed Effect service requirements into executeEffect", async () => {
    const tx = createTestTx();

    class TestWorkflow extends Effect.Service<TestWorkflow>()("test/TestWorkflow", {
      effect: Effect.sync(() => ({
        record: (event: string) =>
          Effect.sync(() => {
            tx.events.push(event);
          }),
      })),
    }) {}

    const defineEffectMutatorWithServices = defineEffectMutatorWithType<
      any,
      TestContext,
      TestWrappedTransaction
    >();
    const mutators = defineMutators({
      cart: {
        add: defineEffectMutatorWithServices<{ albumId: string }>(({ args, ctx, defer }) =>
          Effect.gen(function* () {
            const workflow = yield* TestWorkflow;
            yield* workflow.record(`inline:${ctx.userId}:${args.albumId}`);
            defer(workflow.record(`deferred:${args.albumId}`));
          }),
        ),
      },
    });
    const executeMutation = createMutationExecutor<
      typeof mutators,
      any,
      TestContext,
      TestWrappedTransaction
    >({
      executeEffect: ({ effect, runWithExecutionContext }) =>
        runWithExecutionContext(Effect.provide(effect, TestWorkflow.Default)),
      getContext: () => ({
        userId: "user-1",
      }),
      mutators,
    });

    // @ts-expect-error service-backed Effect mutators require an executor.
    void createMutationExecutor<typeof mutators, any, TestContext, TestWrappedTransaction>({
      getContext: () => ({
        userId: "user-1",
      }),
      mutators,
    });

    const deferredOnlyMutators = defineMutators({
      cart: {
        add: defineEffectMutatorWithServices<{ albumId: string }>(({ args, defer }) => {
          defer(
            Effect.gen(function* () {
              const workflow = yield* TestWorkflow;
              yield* workflow.record(`deferred-only:${args.albumId}`);
            }),
          );
        }),
      },
    });

    // @ts-expect-error deferred-only service effects also require an executor.
    void createMutationExecutor<
      typeof deferredOnlyMutators,
      any,
      TestContext,
      TestWrappedTransaction
    >({
      getContext: () => ({
        userId: "user-1",
      }),
      mutators: deferredOnlyMutators,
    });

    await executeMutation({
      mutation: createMutation(),
      runTransaction: async (execute) => {
        tx.events.push("transaction:start");
        await execute(tx as any, "cart.add", createMutation().args);
        tx.events.push("transaction:commit");
        return undefined;
      },
    });

    expect(tx.events).toEqual([
      "transaction:start",
      "inline:user-1:album-1",
      "transaction:commit",
      "deferred:album-1",
    ]);
  });
});

function createMutation(): ServerMutationLike {
  return {
    args: {
      albumId: "album-1",
    } satisfies ReadonlyJSONValue,
    clientID: "client-1",
    id: 1,
    name: "cart.add",
  };
}

function createTestTx(): TestTx {
  return {
    dbTransaction: {
      wrappedTransaction: {
        label: "tx-1",
      },
    },
    events: [],
    location: "server",
  };
}
