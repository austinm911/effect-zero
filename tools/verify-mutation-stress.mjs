import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildMusicFixtureDemoProtocolStatePath,
  createMusicFixtureApiFixtures,
  createMusicFixtureZeroMutateCartAddFixture,
  createMusicFixtureZeroMutateCartRemoveFixture,
  createMusicFixtureZeroMutation,
  createMusicFixtureZeroPushFixture,
  defaultMusicFixtureApiTarget,
  MUSIC_FIXTURE_API_DEFAULTS,
  musicFixtureApiBrowserTargets,
  musicFixtureApiTargetIds,
} from "../packages/test-utils/src/api-fixtures.ts";
import {
  formatPayload,
  invokeFixture,
  isObject,
  parseArgs,
  parseCsvFilter,
  parsePositiveInteger,
  resolveRepoRoot,
  trimTrailingSlash,
  withFixtureVerificationLock,
} from "./fixture-verification.mjs";

const repoRoot = resolveRepoRoot(import.meta.url);
const args = parseArgs(process.argv.slice(2));
const baseUrl = trimTrailingSlash(
  args["base-url"] ?? process.env.VERIFY_API_BASE_URL ?? "http://localhost:4310",
);
const targetFilter = parseCsvFilter(args.target);
const scenarioFilter = parseCsvFilter(args.scenario);
const outputDir = path.resolve(
  repoRoot,
  args["output-dir"] ?? "verification/results/mutation-stress",
);
const requestTimeoutMs = parsePositiveInteger(
  args["request-timeout-ms"],
  30_000,
  "request-timeout-ms",
);
const selectedTargets = (
  targetFilter === null ? musicFixtureApiBrowserTargets : musicFixtureApiTargetIds
).filter((target) => (targetFilter === null ? true : targetFilter.has(target)));
const scenarioDefinitions = createScenarioDefinitions().filter((scenario) =>
  scenarioFilter === null ? true : scenarioFilter.has(scenario.id),
);

if (selectedTargets.length === 0) {
  throw new Error("No mutation stress targets selected. Check --target filters.");
}

if (scenarioDefinitions.length === 0) {
  throw new Error("No mutation stress scenarios selected. Check --scenario filters.");
}

await withFixtureVerificationLock({
  baseUrl,
  importMetaUrl: import.meta.url,
  metadata: { outputDir },
  operation: async () => {
    await ensureApiReady(baseUrl, defaultMusicFixtureApiTarget);

    const startedAt = performance.now();
    const generatedAt = new Date().toISOString();
    const targetResults = [];

    for (const target of selectedTargets) {
      targetResults.push(await verifyTarget(baseUrl, target));
    }

    const artifact = {
      baseUrl,
      durationMs: roundMetric(performance.now() - startedAt),
      generatedAt,
      kind: "mutation-stress-verification",
      targetResults,
    };

    await mkdir(outputDir, { recursive: true });

    const timestampForFile = generatedAt.replaceAll(":", "-");
    const runPath = path.join(outputDir, `mutation-stress-${timestampForFile}.json`);
    const latestPath = path.join(outputDir, "latest.json");
    const artifactJson = `${JSON.stringify(artifact, null, 2)}\n`;

    await writeFile(runPath, artifactJson, "utf8");
    await writeFile(latestPath, artifactJson, "utf8");

    console.log(`Wrote ${path.relative(repoRoot, runPath)}`);
    console.log(`Updated ${path.relative(repoRoot, latestPath)}`);
    console.log(JSON.stringify(artifact, null, 2));
  },
  task: "mutation-stress",
});

async function verifyTarget(baseUrl, target) {
  const scenarioResults = [];

  for (const scenario of scenarioDefinitions) {
    scenarioResults.push(await scenario.run(baseUrl, target));
  }

  return {
    scenarioResults,
    target,
  };
}

function createScenarioDefinitions() {
  return [
    {
      id: "sequential.requests.10.alternating",
      run: (currentBaseUrl, target) =>
        runSequentialAlternatingScenario(currentBaseUrl, target, 10),
    },
    {
      id: "sequential.requests.100.alternating",
      run: (currentBaseUrl, target) =>
        runSequentialAlternatingScenario(currentBaseUrl, target, 100),
    },
    {
      id: "batched.request.10.alternating",
      run: (currentBaseUrl, target) => runBatchedAlternatingScenario(currentBaseUrl, target, 10),
    },
    {
      id: "batched.request.100.alternating",
      run: (currentBaseUrl, target) => runBatchedAlternatingScenario(currentBaseUrl, target, 100),
    },
    {
      id: "duplicate.replay.single",
      run: (currentBaseUrl, target) => runDuplicateReplayScenario(currentBaseUrl, target),
    },
    {
      id: "out-of-order.single",
      run: (currentBaseUrl, target) => runOutOfOrderScenario(currentBaseUrl, target),
    },
    {
      id: "parallel.clients.10.same-user",
      run: (currentBaseUrl, target) => runParallelSameUserScenario(currentBaseUrl, target, 10),
    },
  ];
}

async function runSequentialAlternatingScenario(baseUrl, target, iterations) {
  const clientGroupID = `cg-stress-${target}-seq-${iterations}`;
  const clientID = `c-stress-${target}-seq-${iterations}`;
  const userId = `stress-user-${target}-seq-${iterations}`;
  const startedAt = performance.now();

  await resetTarget(baseUrl, target);

  for (let mutationID = 1; mutationID <= iterations; mutationID += 1) {
    const fixture =
      mutationID % 2 === 1
        ? createMusicFixtureZeroMutateCartAddFixture({
            clientGroupID,
            clientID,
            mutationID,
            target,
            timestamp: MUSIC_FIXTURE_API_DEFAULTS.timestamp + mutationID,
            userId,
          })
        : createMusicFixtureZeroMutateCartRemoveFixture({
            clientGroupID,
            clientID,
            mutationID,
            target,
            timestamp: MUSIC_FIXTURE_API_DEFAULTS.timestamp + mutationID,
            userId,
          });

    assertSuccessfulMutations(
      await invokeFixture(baseUrl, fixture, { requestTimeoutMs }),
      1,
      fixture.id,
    );
  }

  const state = await getProtocolState(baseUrl, {
    clientGroupID,
    clientID,
    target,
    userId,
  });

  assertProtocolState(state, {
    cartAlbumIds: [],
    cartItemCount: 0,
    lastMutationID: iterations,
    userId,
  });
  assertAuthoringState(state, target, { expectMutationExecution: true });

  return {
    durationMs: roundMetric(performance.now() - startedAt),
    finalCartItemCount: state.cartItemCount,
    id: `sequential.requests.${iterations}.alternating`,
    mutationResultCount: state.zeroClient?.mutationResultCount ?? 0,
    requestCount: iterations,
  };
}

async function runBatchedAlternatingScenario(baseUrl, target, iterations) {
  const clientGroupID = `cg-stress-${target}-batch-${iterations}`;
  const clientID = `c-stress-${target}-batch-${iterations}`;
  const userId = `stress-user-${target}-batch-${iterations}`;
  const startedAt = performance.now();

  await resetTarget(baseUrl, target);

  const mutations = Array.from({ length: iterations }, (_, index) => {
    const mutationID = index + 1;
    const timestamp = MUSIC_FIXTURE_API_DEFAULTS.timestamp + mutationID;

    return createMusicFixtureZeroMutation({
      args:
        mutationID % 2 === 1
          ? {
              __benchmarkUserId: userId,
              addedAt: timestamp,
              albumId: MUSIC_FIXTURE_API_DEFAULTS.albumId,
            }
          : {
              __benchmarkUserId: userId,
              albumId: MUSIC_FIXTURE_API_DEFAULTS.albumId,
            },
      clientID,
      mutationID,
      mutatorName: mutationID % 2 === 1 ? "cart.add" : "cart.remove",
      timestamp,
    });
  });
  const fixture = createMusicFixtureZeroPushFixture({
    clientGroupID,
    fixtureId: `zero-mutate-batch-${iterations}`,
    mutations,
    requestID: `req-batch-${target}-${iterations}`,
    target,
    timestamp: MUSIC_FIXTURE_API_DEFAULTS.timestamp + iterations,
  });

  assertSuccessfulMutations(
    await invokeFixture(baseUrl, fixture, { requestTimeoutMs }),
    iterations,
    fixture.id,
  );

  const state = await getProtocolState(baseUrl, {
    clientGroupID,
    clientID,
    target,
    userId,
  });

  assertProtocolState(state, {
    cartAlbumIds: [],
    cartItemCount: 0,
    lastMutationID: iterations,
    userId,
  });
  assertAuthoringState(state, target, { expectMutationExecution: true });

  return {
    durationMs: roundMetric(performance.now() - startedAt),
    finalCartItemCount: state.cartItemCount,
    id: `batched.request.${iterations}.alternating`,
    mutationResultCount: state.zeroClient?.mutationResultCount ?? 0,
    requestCount: 1,
  };
}

async function runDuplicateReplayScenario(baseUrl, target) {
  const clientGroupID = `cg-stress-${target}-duplicate`;
  const clientID = `c-stress-${target}-duplicate`;
  const userId = `stress-user-${target}-duplicate`;
  const fixture = createMusicFixtureZeroMutateCartAddFixture({
    clientGroupID,
    clientID,
    mutationID: 1,
    target,
    userId,
  });
  const startedAt = performance.now();

  await resetTarget(baseUrl, target);

  assertSuccessfulMutations(
    await invokeFixture(baseUrl, fixture, { requestTimeoutMs }),
    1,
    `${fixture.id}:first`,
  );
  assertAlreadyProcessedMutation(
    await invokeFixture(baseUrl, fixture, { requestTimeoutMs }),
    fixture.body.mutations[0]?.id ?? 1,
    `${fixture.id}:replay`,
  );

  const state = await getProtocolState(baseUrl, {
    clientGroupID,
    clientID,
    target,
    userId,
  });

  assertProtocolState(state, {
    cartAlbumIds: [MUSIC_FIXTURE_API_DEFAULTS.albumId],
    cartItemCount: 1,
    lastMutationID: 1,
    userId,
  });
  assertAuthoringState(state, target, { expectMutationExecution: true });

  return {
    durationMs: roundMetric(performance.now() - startedAt),
    finalCartItemCount: state.cartItemCount,
    id: "duplicate.replay.single",
    mutationResultCount: state.zeroClient?.mutationResultCount ?? 0,
    requestCount: 2,
  };
}

async function runOutOfOrderScenario(baseUrl, target) {
  const clientGroupID = `cg-stress-${target}-out-of-order`;
  const clientID = `c-stress-${target}-out-of-order`;
  const userId = `stress-user-${target}-out-of-order`;
  const fixture = createMusicFixtureZeroMutateCartAddFixture({
    clientGroupID,
    clientID,
    mutationID: 2,
    target,
    userId,
  });
  const startedAt = performance.now();

  await resetTarget(baseUrl, target);

  assertOutOfOrderPushFailure(
    await invokeFixture(baseUrl, fixture, { requestTimeoutMs }),
    fixture.body.mutations[0]?.id ?? 2,
    fixture.id,
  );

  const state = await getProtocolState(baseUrl, {
    clientGroupID,
    clientID,
    target,
    userId,
  });

  if (state.cartItemCount !== 0) {
    throw new Error(
      `Expected no cart rows after out-of-order mutation, received ${state.cartItemCount}.`,
    );
  }

  if (state.zeroClient !== null && state.zeroClient.exists) {
    throw new Error(
      `Expected no LMID row after out-of-order mutation, received ${JSON.stringify(state.zeroClient)}.`,
    );
  }
  assertAuthoringState(state, target, { expectMutationExecution: false });

  return {
    durationMs: roundMetric(performance.now() - startedAt),
    finalCartItemCount: state.cartItemCount,
    id: "out-of-order.single",
    mutationResultCount: state.zeroClient?.mutationResultCount ?? 0,
    requestCount: 1,
  };
}

async function runParallelSameUserScenario(baseUrl, target, clientCount) {
  const clientGroupID = `cg-stress-${target}-parallel-${clientCount}`;
  const userId = `stress-user-${target}-parallel-${clientCount}`;
  const fixtures = Array.from({ length: clientCount }, (_, index) =>
    createMusicFixtureZeroMutateCartAddFixture({
      clientGroupID,
      clientID: `c-stress-${target}-parallel-${index + 1}`,
      mutationID: 1,
      target,
      timestamp: MUSIC_FIXTURE_API_DEFAULTS.timestamp + index + 1,
      userId,
    }),
  );
  const startedAt = performance.now();

  await resetTarget(baseUrl, target);

  const responses = await Promise.all(
    fixtures.map((fixture) => invokeFixture(baseUrl, fixture, { requestTimeoutMs })),
  );

  for (let index = 0; index < responses.length; index += 1) {
    assertSuccessfulMutations(responses[index], 1, `${fixtures[index]?.id}:${index + 1}`);
  }

  const sharedUserState = await getProtocolState(baseUrl, {
    target,
    userId,
  });

  if (sharedUserState.cartItemCount !== 1) {
    throw new Error(
      `Expected one cart row after parallel same-user adds, received ${sharedUserState.cartItemCount}.`,
    );
  }

  if (
    sharedUserState.cartAlbumIds.length !== 1 ||
    sharedUserState.cartAlbumIds[0] !== MUSIC_FIXTURE_API_DEFAULTS.albumId
  ) {
    throw new Error(
      `Expected the shared cart row to contain ${MUSIC_FIXTURE_API_DEFAULTS.albumId}, received ${JSON.stringify(sharedUserState.cartAlbumIds)}.`,
    );
  }

  const clientStates = await Promise.all(
    fixtures.map((fixture) =>
      getProtocolState(baseUrl, {
        clientGroupID,
        clientID: fixture.body.mutations[0]?.clientID ?? "",
        target,
        userId,
      }),
    ),
  );

  for (const state of clientStates) {
    assertProtocolState(state, {
      cartAlbumIds: [MUSIC_FIXTURE_API_DEFAULTS.albumId],
      cartItemCount: 1,
      lastMutationID: 1,
      userId,
    });
    assertAuthoringState(state, target, { expectMutationExecution: true });
  }

  return {
    durationMs: roundMetric(performance.now() - startedAt),
    finalCartItemCount: sharedUserState.cartItemCount,
    id: `parallel.clients.${clientCount}.same-user`,
    mutationResultCount: clientStates.reduce(
      (sum, state) => sum + (state.zeroClient?.mutationResultCount ?? 0),
      0,
    ),
    requestCount: clientCount,
  };
}

async function resetTarget(baseUrl, target) {
  const fixtures = createMusicFixtureApiFixtures({ target });
  await invokeFixture(baseUrl, fixtures.control.reset, { requestTimeoutMs });
}

async function ensureApiReady(baseUrl, target) {
  const fixtures = createMusicFixtureApiFixtures({ target });

  try {
    await invokeFixture(baseUrl, fixtures.control.state, { requestTimeoutMs });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Mutation stress verification could not reach ${baseUrl}. Start the local app with \`pnpm dev\`, the Node harness with \`pnpm dev:api\`, the local Postgres stack with \`pnpm dev:db\`, and Zero Cache with \`pnpm dev:zero\`. Cause: ${message}`,
    );
  }
}

async function getProtocolState(baseUrl, options) {
  const fixture = {
    id: "demo-protocol-state",
    method: "GET",
    path: buildMusicFixtureDemoProtocolStatePath(options),
  };
  const payload = await invokeFixture(baseUrl, fixture, { requestTimeoutMs });

  if (!isObject(payload)) {
    throw new Error(`Unexpected protocol-state payload: ${formatPayload(payload)}`);
  }

  return payload;
}

function assertSuccessfulMutations(payload, expectedCount, label) {
  if (
    !isObject(payload) ||
    !Array.isArray(payload.mutations) ||
    payload.mutations.length !== expectedCount
  ) {
    throw new Error(
      `Expected ${expectedCount} successful mutations for ${label}, received ${formatPayload(payload)}.`,
    );
  }

  for (const mutation of payload.mutations) {
    if (!isObject(mutation) || !isObject(mutation.id) || !isObject(mutation.result)) {
      throw new Error(`Unexpected mutation response shape for ${label}: ${formatPayload(payload)}`);
    }

    if (Object.keys(mutation.result).length !== 0) {
      throw new Error(
        `Expected an empty mutation result for ${label}, received ${formatPayload(mutation.result)}.`,
      );
    }
  }
}

function assertAlreadyProcessedMutation(payload, expectedMutationID, label) {
  if (!isObject(payload) || !Array.isArray(payload.mutations) || payload.mutations.length !== 1) {
    throw new Error(
      `Expected one duplicate replay response for ${label}, received ${formatPayload(payload)}.`,
    );
  }

  const [mutation] = payload.mutations;

  if (
    !isObject(mutation) ||
    !isObject(mutation.id) ||
    mutation.id.id !== expectedMutationID ||
    !isObject(mutation.result) ||
    mutation.result.error !== "alreadyProcessed"
  ) {
    throw new Error(
      `Expected alreadyProcessed replay response for ${label}, received ${formatPayload(payload)}.`,
    );
  }
}

function assertOutOfOrderPushFailure(payload, expectedMutationID, label) {
  if (
    !isObject(payload) ||
    payload.kind !== "PushFailed" ||
    payload.reason !== "oooMutation" ||
    !Array.isArray(payload.mutationIDs)
  ) {
    throw new Error(
      `Expected out-of-order push failure for ${label}, received ${formatPayload(payload)}.`,
    );
  }

  const [mutationID] = payload.mutationIDs;

  if (!isObject(mutationID) || mutationID.id !== expectedMutationID) {
    throw new Error(
      `Expected failed mutation id ${expectedMutationID} for ${label}, received ${formatPayload(payload)}.`,
    );
  }
}

function assertProtocolState(payload, expectation) {
  if (
    !isObject(payload) ||
    payload.userId !== expectation.userId ||
    !Array.isArray(payload.cartAlbumIds)
  ) {
    throw new Error(`Unexpected protocol-state payload: ${formatPayload(payload)}`);
  }

  if (payload.cartItemCount !== expectation.cartItemCount) {
    throw new Error(
      `Expected cartItemCount ${expectation.cartItemCount}, received ${String(payload.cartItemCount)}.`,
    );
  }

  if (JSON.stringify(payload.cartAlbumIds) !== JSON.stringify(expectation.cartAlbumIds)) {
    throw new Error(
      `Expected cart albums ${JSON.stringify(expectation.cartAlbumIds)}, received ${JSON.stringify(payload.cartAlbumIds)}.`,
    );
  }

  if (!isObject(payload.zeroClient)) {
    throw new Error(`Expected zeroClient state, received ${formatPayload(payload)}`);
  }

  if (payload.zeroClient.lastMutationID !== expectation.lastMutationID) {
    throw new Error(
      `Expected lastMutationID ${expectation.lastMutationID}, received ${String(payload.zeroClient.lastMutationID)}.`,
    );
  }

  if (
    "mutationResultIDs" in expectation &&
    JSON.stringify(payload.zeroClient.mutationResultIDs) !==
      JSON.stringify(expectation.mutationResultIDs)
  ) {
    throw new Error(
      `Expected mutationResultIDs ${JSON.stringify(expectation.mutationResultIDs)}, received ${JSON.stringify(payload.zeroClient.mutationResultIDs)}.`,
    );
  }
}

function assertAuthoringState(payload, target, options) {
  if (!isObject(payload.authoring)) {
    throw new Error(`Expected authoring state, received ${formatPayload(payload)}`);
  }

  const authoring = payload.authoring;
  const expectedMode = expectedAuthoringMode(target);

  if (authoring.mode !== expectedMode) {
    throw new Error(
      `Expected authoring mode ${expectedMode}, received ${String(authoring.mode)}.`,
    );
  }

  if (!options.expectMutationExecution || target === "control") {
    return;
  }

  if (target.endsWith("-drizzle")) {
    if (
      !isPositiveInteger(authoring.servicePlanRuns) ||
      !isPositiveInteger(authoring.wrappedTransactionReads) ||
      !isPositiveInteger(authoring.afterCommitRuns)
    ) {
      throw new Error(
        `Expected service-backed drizzle authoring counters for ${target}, received ${formatPayload(authoring)}.`,
      );
    }

    return;
  }

  if (!isPositiveInteger(authoring.rawSqlMutations)) {
    throw new Error(
      `Expected raw SQL authoring counters for ${target}, received ${formatPayload(authoring)}.`,
    );
  }
}

function expectedAuthoringMode(target) {
  if (target === "control") {
    return "shared-client-mutator";
  }

  if (target.endsWith("-drizzle")) {
    return "service-workflow";
  }

  return "raw-sql";
}

function isPositiveInteger(value) {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function roundMetric(value) {
  return Math.round(value * 100) / 100;
}
