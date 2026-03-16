import { execFileSync } from "node:child_process";
import dns from "node:dns";
import { mkdir, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createMusicFixtureApiFixtures,
  createMusicFixtureZeroMutation,
  createMusicFixtureZeroPushFixture,
  defaultMusicFixtureApiTarget,
  MUSIC_FIXTURE_API_DEFAULTS,
  musicFixtureApiBrowserTargets,
  musicFixtureApiTargetIds,
} from "../packages/test-utils/src/api-fixtures.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const args = parseArgs(process.argv.slice(2));
const baseUrl = trimTrailingSlash(
  args["base-url"] ??
    process.env.VERIFY_MUTATION_FLOW_BASE_URL ??
    "http://effect-zero-ztunes.localhost:1355",
);
const pgUrl =
  args["pg-url"] ?? process.env.PG_URL ?? "postgres://postgres:postgres@127.0.0.1:5438/effect_zero";
const outputDir = path.resolve(
  repoRoot,
  args["output-dir"] ?? "verification/results/zero-mutation-flow",
);
const requestTimeoutMs = parsePositiveInteger(
  args["request-timeout-ms"],
  30_000,
  "request-timeout-ms",
);
const targetFilter = parseCsvFilter(args.target);
const selectedTargets = (
  targetFilter === null ? musicFixtureApiBrowserTargets : musicFixtureApiTargetIds
).filter((target) => (targetFilter === null ? true : targetFilter.has(target)));
const lockDir = path.resolve(repoRoot, "verification/.zero-mutation-flow.lock");
const defaultAlbumId = MUSIC_FIXTURE_API_DEFAULTS.albumId;

if (selectedTargets.length === 0) {
  throw new Error("No targets selected. Check --target filters.");
}

await withLock(async () => {
  await ensureApiReady(baseUrl, selectedTargets[0] ?? defaultMusicFixtureApiTarget);

  const startedAt = performance.now();
  const gitSha = readGitSha();
  const targetResults = [];

  for (const target of selectedTargets) {
    targetResults.push(await verifyTarget({ baseUrl, pgUrl, target }));
  }

  const artifact = {
    baseUrl,
    durationMs: roundMs(performance.now() - startedAt),
    generatedAt: new Date().toISOString(),
    gitSha,
    kind: "zero-mutation-flow-verification",
    pgUrl,
    targetResults,
  };

  await mkdir(outputDir, { recursive: true });

  const timestampForFile = artifact.generatedAt.replaceAll(":", "-");
  const runPath = path.join(outputDir, `zero-mutation-flow-${timestampForFile}.json`);
  const latestPath = path.join(outputDir, "latest.json");
  const artifactJson = `${JSON.stringify(artifact, null, 2)}\n`;

  await writeFile(runPath, artifactJson, "utf8");
  await writeFile(latestPath, artifactJson, "utf8");

  console.log(JSON.stringify(artifact, null, 2));
  console.log(`Wrote ${path.relative(repoRoot, runPath)}`);
  console.log(`Updated ${path.relative(repoRoot, latestPath)}`);
});

async function verifyTarget({ baseUrl, pgUrl, target }) {
  const scenarios = [
    runSequentialSameClientScenario,
    runBatchedSameClientScenario,
    runOutOfOrderRejectedScenario,
  ];
  const scenarioResults = [];
  const targetStartedAt = performance.now();

  for (const scenario of scenarios) {
    scenarioResults.push(await scenario({ baseUrl, pgUrl, target }));
  }

  return {
    durationMs: roundMs(performance.now() - targetStartedAt),
    scenarioResults,
    target,
  };
}

async function runSequentialSameClientScenario({ baseUrl, pgUrl, target }) {
  const clientGroupID = `cg-flow-${target}-sequential`;
  const clientID = `c-flow-${target}-sequential`;
  const userId = `flow-user-${target}-sequential`;
  const operations = [
    makeAddOperation(defaultAlbumId, 1, userId),
    makeRemoveOperation(defaultAlbumId, 2, userId),
    makeAddOperation(defaultAlbumId, 3, userId),
  ];
  const requestMetrics = [];

  await resetTarget(baseUrl, target);

  for (const operation of operations) {
    const requestStartedAt = performance.now();
    const payload = await invokeJson(
      baseUrl,
      createMusicFixtureZeroPushFixture({
        clientGroupID,
        fixtureId: "zero-mutate-flow-sequential",
        mutations: [
          createMusicFixtureZeroMutation({
            args: operation.args,
            clientID,
            mutationID: operation.mutationID,
            mutatorName: operation.mutatorName,
            timestamp: operation.timestamp,
          }),
        ],
        requestID: `req-sequential-${operation.mutationID}`,
        target,
        timestamp: operation.timestamp,
      }),
    );
    assertZeroMutationAccepted(payload, target, "sequential-same-client");
    requestMetrics.push({
      durationMs: roundMs(performance.now() - requestStartedAt),
      mutationID: operation.mutationID,
      mutatorName: operation.mutatorName,
    });
  }

  const convergence = await waitForExpectedState({
    baseUrl,
    clientGroupID,
    clientID,
    expectedAlbumIds: [defaultAlbumId],
    expectedLmid: operations.length,
    pgUrl,
    target,
    userId,
  });

  return {
    clientGroupID,
    clientID,
    expectedAlbumIds: convergence.expectedAlbumIds,
    expectedLmid: operations.length,
    observedApiAlbumIds: convergence.apiAlbumIds,
    observedLmid: convergence.lmid,
    observedPostgresAlbumIds: convergence.postgresAlbumIds,
    requestMetrics,
    scenarioId: "sequential-same-client",
    status: "passed",
    totalRequestDurationMs: summarizeDurations(requestMetrics.map((metric) => metric.durationMs)),
    zqlConvergenceMs: convergence.durationMs,
  };
}

async function runBatchedSameClientScenario({ baseUrl, pgUrl, target }) {
  const clientGroupID = `cg-flow-${target}-batched`;
  const clientID = `c-flow-${target}-batched`;
  const userId = `flow-user-${target}-batched`;
  const operations = [
    makeAddOperation(defaultAlbumId, 1, userId),
    makeRemoveOperation(defaultAlbumId, 2, userId),
    makeAddOperation(defaultAlbumId, 3, userId),
  ];

  await resetTarget(baseUrl, target);

  const requestStartedAt = performance.now();
  const payload = await invokeJson(
    baseUrl,
    createMusicFixtureZeroPushFixture({
      clientGroupID,
      fixtureId: "zero-mutate-flow-batch",
      mutations: operations.map((operation) =>
        createMusicFixtureZeroMutation({
          args: operation.args,
          clientID,
          mutationID: operation.mutationID,
          mutatorName: operation.mutatorName,
          timestamp: operation.timestamp,
        }),
      ),
      requestID: "req-batch-1-3",
      target,
      timestamp: operations[operations.length - 1].timestamp,
    }),
  );
  assertZeroMutationAccepted(payload, target, "batched-same-client");

  const convergence = await waitForExpectedState({
    baseUrl,
    clientGroupID,
    clientID,
    expectedAlbumIds: [defaultAlbumId],
    expectedLmid: operations.length,
    pgUrl,
    target,
    userId,
  });

  return {
    clientGroupID,
    clientID,
    expectedAlbumIds: convergence.expectedAlbumIds,
    expectedLmid: operations.length,
    observedApiAlbumIds: convergence.apiAlbumIds,
    observedLmid: convergence.lmid,
    observedPostgresAlbumIds: convergence.postgresAlbumIds,
    requestDurationMs: roundMs(performance.now() - requestStartedAt),
    scenarioId: "batched-same-client",
    status: "passed",
    zqlConvergenceMs: convergence.durationMs,
  };
}

async function runOutOfOrderRejectedScenario({ baseUrl, pgUrl, target }) {
  const clientGroupID = `cg-flow-${target}-out-of-order`;
  const clientID = `c-flow-${target}-out-of-order`;
  const userId = `flow-user-${target}-out-of-order`;

  await resetTarget(baseUrl, target);

  const requestStartedAt = performance.now();
  const payload = await invokeJson(
    baseUrl,
    createMusicFixtureZeroPushFixture({
      clientGroupID,
      fixtureId: "zero-mutate-flow-out-of-order",
      mutations: [
        createMusicFixtureZeroMutation({
          args: {
            __benchmarkUserId: userId,
            addedAt: 1_743_127_752_999,
            albumId: defaultAlbumId,
          },
          clientID,
          mutationID: 2,
          mutatorName: "cart.add",
          timestamp: 1_743_127_752_999,
        }),
      ],
      requestID: "req-out-of-order-2",
      target,
      timestamp: 1_743_127_752_999,
    }),
  );
  const requestDurationMs = roundMs(performance.now() - requestStartedAt);
  assertOutOfOrderPushFailure(payload, target);

  const lmid = readLastMutationId(pgUrl, clientGroupID, clientID);
  const postgresAlbumIds = readPostgresCartAlbumIds(pgUrl, userId);
  const apiAlbumIds = await readApiCartAlbumIds(baseUrl, target);

  if (lmid !== null) {
    throw new Error(
      `Expected no LMID row after out-of-order rejection for ${target}, received ${lmid}`,
    );
  }

  if (postgresAlbumIds.length !== 0) {
    throw new Error(
      `Expected empty Postgres cart after out-of-order rejection for ${target}, received ${postgresAlbumIds.join(",")}`,
    );
  }

  if (apiAlbumIds.length !== 0) {
    throw new Error(
      `Expected empty adapter read after out-of-order rejection for ${target}, received ${apiAlbumIds.join(",")}`,
    );
  }

  return {
    clientGroupID,
    clientID,
    observedApiAlbumIds: apiAlbumIds,
    observedLmid: lmid,
    observedPostgresAlbumIds: postgresAlbumIds,
    requestDurationMs,
    response: payload,
    scenarioId: "out-of-order-rejected",
    status: "passed",
  };
}

async function waitForExpectedState({
  baseUrl,
  clientGroupID,
  clientID,
  expectedAlbumIds,
  expectedLmid,
  pgUrl,
  target,
  userId,
}) {
  const startedAt = performance.now();
  const deadline = startedAt + requestTimeoutMs;

  for (;;) {
    const lmid = readLastMutationId(pgUrl, clientGroupID, clientID);
    const postgresAlbumIds = readPostgresCartAlbumIds(pgUrl, userId);
    const apiAlbumIds = await readApiCartAlbumIds(baseUrl, target);

    if (
      lmid === expectedLmid &&
      arraysEqual(postgresAlbumIds, expectedAlbumIds) &&
      arraysEqual(apiAlbumIds, expectedAlbumIds)
    ) {
      return {
        apiAlbumIds,
        durationMs: roundMs(performance.now() - startedAt),
        expectedAlbumIds,
        lmid,
        postgresAlbumIds,
      };
    }

    if (performance.now() >= deadline) {
      throw new Error(
        [
          `Timed out waiting for expected state in target ${target}.`,
          `Expected LMID=${expectedLmid}, Postgres/API albums=${expectedAlbumIds.join(",") || "(empty)"}.`,
          `Observed LMID=${String(lmid)}, Postgres albums=${postgresAlbumIds.join(",") || "(empty)"}, API albums=${apiAlbumIds.join(",") || "(empty)"}.`,
        ].join(" "),
      );
    }

    await wait(50);
  }
}

async function readApiCartAlbumIds(baseUrl, target) {
  const fixtures = createMusicFixtureApiFixtures({ target });
  const payload = await invokeJson(baseUrl, fixtures.zql.readCartItems);

  if (!Array.isArray(payload)) {
    throw new Error(
      `Expected cart-items array for target ${target}, received ${formatPayload(payload)}`,
    );
  }

  return payload
    .map((item) => (isObject(item) && typeof item.albumId === "string" ? item.albumId : null))
    .filter((albumId) => albumId !== null);
}

async function resetTarget(baseUrl, target) {
  const fixtures = createMusicFixtureApiFixtures({ target });
  await invokeJson(baseUrl, fixtures.control.reset);
}

async function ensureApiReady(baseUrl, target) {
  const fixtures = createMusicFixtureApiFixtures({ target });

  try {
    await invokeJson(baseUrl, fixtures.control.state);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Zero mutation flow verification could not reach ${baseUrl}. Start the frontend with \`pnpm dev\`, the Node harness with \`pnpm dev:api\` when needed, the local Postgres stack with \`pnpm dev:db\`, and Zero Cache with \`pnpm dev:zero\`. Cause: ${message}`,
    );
  }
}

async function invokeJson(baseUrl, fixture) {
  const abortController = new AbortController();
  const timeout = setTimeout(() => {
    abortController.abort(
      new Error(`Timed out after ${requestTimeoutMs}ms calling ${fixture.method} ${fixture.path}`),
    );
  }, requestTimeoutMs);

  let response;

  try {
    response = await requestWithPortlessLookup(`${baseUrl}${fixture.path}`, {
      body: fixture.body === undefined ? undefined : JSON.stringify(fixture.body),
      headers: fixture.body === undefined ? undefined : { "content-type": "application/json" },
      method: fixture.method,
      signal: abortController.signal,
    });
  } catch (error) {
    throw new Error(
      `${fixture.id} request failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    clearTimeout(timeout);
  }

  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    throw new Error(`${fixture.id} failed with ${response.status}: ${formatPayload(payload)}`);
  }

  return payload;
}

function readLastMutationId(pgUrl, clientGroupID, clientID) {
  const sql = `
    select "lastMutationID"
    from zero_0.clients
    where "clientGroupID" = '${escapeSqlLiteral(clientGroupID)}'
      and "clientID" = '${escapeSqlLiteral(clientID)}'
  `;
  const output = runPsql(pgUrl, sql);

  if (output.length === 0) {
    return null;
  }

  const parsed = Number.parseInt(output, 10);

  if (!Number.isFinite(parsed)) {
    throw new Error(`Could not parse LMID output: ${output}`);
  }

  return parsed;
}

function readPostgresCartAlbumIds(pgUrl, userId) {
  const sql = `
    select album_id
    from cart_item
    where user_id = '${escapeSqlLiteral(userId)}'
    order by added_at desc, album_id asc
  `;
  const output = runPsql(pgUrl, sql);

  if (output.length === 0) {
    return [];
  }

  return output
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
}

function runPsql(pgUrl, sql) {
  return execFileSync("psql", [pgUrl, "-At", "-F", "\t", "-c", sql], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function assertZeroMutationAccepted(payload, target, scenarioId) {
  if (!isObject(payload) || !Array.isArray(payload.mutations)) {
    throw new Error(
      `Expected successful zero mutate response for ${target}/${scenarioId}, received ${formatPayload(payload)}`,
    );
  }
}

function assertOutOfOrderPushFailure(payload, target) {
  if (!isObject(payload) || payload.kind !== "PushFailed" || payload.reason !== "oooMutation") {
    throw new Error(
      `Expected out-of-order push failure for ${target}, received ${formatPayload(payload)}`,
    );
  }
}

function summarizeDurations(durations) {
  if (durations.length === 0) {
    return { avgMs: 0, maxMs: 0, minMs: 0 };
  }

  const minMs = Math.min(...durations);
  const maxMs = Math.max(...durations);
  const avgMs = durations.reduce((sum, duration) => sum + duration, 0) / durations.length;

  return {
    avgMs: roundMs(avgMs),
    maxMs: roundMs(maxMs),
    minMs: roundMs(minMs),
  };
}

function makeAddOperation(albumId, mutationID, userId) {
  return {
    args: {
      __benchmarkUserId: userId,
      addedAt: 1_743_127_752_952 + mutationID,
      albumId,
    },
    mutationID,
    mutatorName: "cart.add",
    timestamp: 1_743_127_752_952 + mutationID,
  };
}

function makeRemoveOperation(albumId, mutationID, userId) {
  return {
    args: {
      __benchmarkUserId: userId,
      albumId,
    },
    mutationID,
    mutatorName: "cart.remove",
    timestamp: 1_743_127_752_952 + mutationID,
  };
}

async function withLock(operation) {
  await acquireLock();

  try {
    return await operation();
  } finally {
    await rm(lockDir, { force: true, recursive: true });
  }
}

async function acquireLock() {
  try {
    await mkdir(lockDir);
  } catch (error) {
    if (isNodeError(error) && error.code === "EEXIST") {
      throw new Error(
        "Another zero mutation flow verification is already running. Do not run multiple local fixture verifiers at the same time.",
      );
    }

    throw error;
  }

  await writeFile(
    path.join(lockDir, "owner.json"),
    `${JSON.stringify({ baseUrl, pgUrl, pid: process.pid, startedAt: new Date().toISOString() }, null, 2)}\n`,
    "utf8",
  );
}

function parseArgs(argv) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token?.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const nextToken = argv[index + 1];

    if (!nextToken || nextToken.startsWith("--")) {
      parsed[key] = "true";
      continue;
    }

    parsed[key] = nextToken;
    index += 1;
  }

  return parsed;
}

function parseCsvFilter(rawValue) {
  if (!rawValue) {
    return null;
  }

  return new Set(
    String(rawValue)
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

function parsePositiveInteger(rawValue, fallback, label) {
  if (rawValue === undefined) {
    return fallback;
  }

  const parsed = Number.parseInt(String(rawValue), 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Expected --${label} to be a positive integer.`);
  }

  return parsed;
}

function trimTrailingSlash(value) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function arraysEqual(left, right) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function escapeSqlLiteral(value) {
  return String(value).replaceAll("'", "''");
}

function roundMs(value) {
  return Number(value.toFixed(2));
}

function readGitSha() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "uncommitted-worktree";
  }
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNodeError(value) {
  return value instanceof Error && "code" in value;
}

function formatPayload(payload) {
  return typeof payload === "string" ? payload : JSON.stringify(payload);
}

function lookupPortlessHostname(hostname, options, callback) {
  if (hostname.endsWith(".localhost")) {
    if (typeof options === "object" && options?.all) {
      callback(null, [{ address: "127.0.0.1", family: 4 }]);
      return;
    }

    callback(null, "127.0.0.1", 4);
    return;
  }

  dns.lookup(hostname, options, callback);
}

async function requestWithPortlessLookup(url, options) {
  const requestUrl = new URL(url);
  const transport = requestUrl.protocol === "https:" ? https : http;

  return await new Promise((resolve, reject) => {
    const request = transport.request(
      requestUrl,
      {
        headers: options.headers,
        lookup: lookupPortlessHostname,
        method: options.method,
        signal: options.signal,
      },
      (response) => {
        const chunks = [];

        response.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });

        response.on("end", () => {
          const bodyText = Buffer.concat(chunks).toString("utf8");
          const headers = new Headers();

          for (const [key, value] of Object.entries(response.headers)) {
            if (value === undefined) {
              continue;
            }

            if (Array.isArray(value)) {
              for (const entry of value) {
                headers.append(key, entry);
              }
              continue;
            }

            headers.set(key, value);
          }

          resolve({
            headers,
            json: async () => JSON.parse(bodyText),
            ok:
              typeof response.statusCode === "number" &&
              response.statusCode >= 200 &&
              response.statusCode < 300,
            status: response.statusCode ?? 500,
            text: async () => bodyText,
          });
        });
      },
    );

    request.on("error", reject);

    if (options.body !== undefined) {
      request.write(options.body);
    }

    request.end();
  });
}

function wait(durationMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}
