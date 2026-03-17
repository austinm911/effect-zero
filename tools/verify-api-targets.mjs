import {
  createMusicFixtureApiFixtures,
  defaultMusicFixtureApiTarget,
  MUSIC_FIXTURE_API_DEFAULTS,
  musicFixtureApiBrowserTargets,
  musicFixtureApiTargetIds,
} from "../packages/test-utils/src/api-fixtures.ts";
import {
  formatPayload,
  invokeFixture,
  invokeFixtureDetailed,
  isObject,
  parseArgs,
  parseCsvFilter,
  trimTrailingSlash,
  withFixtureVerificationLock,
} from "./fixture-verification.mjs";

const args = parseArgs(process.argv.slice(2));
const baseUrl = trimTrailingSlash(
  args["base-url"] ?? process.env.VERIFY_API_BASE_URL ?? "http://localhost:4310",
);
const targetFilter = parseCsvFilter(args.target);
const selectedTargets = (
  targetFilter === null ? musicFixtureApiBrowserTargets : musicFixtureApiTargetIds
).filter((target) => (targetFilter === null ? true : targetFilter.has(target)));

if (selectedTargets.length === 0) {
  throw new Error("No verification targets selected. Check --target filters.");
}

await withFixtureVerificationLock({
  baseUrl,
  importMetaUrl: import.meta.url,
  task: "api-target-verification",
  operation: async () => {
    await ensureApiReady(baseUrl, defaultMusicFixtureApiTarget);

    const startedAt = performance.now();
    const targetResults = [];

    for (const target of selectedTargets) {
      targetResults.push(await verifyTarget(baseUrl, target));
    }

    console.log(
      JSON.stringify(
        {
          baseUrl,
          durationMs: Number((performance.now() - startedAt).toFixed(2)),
          kind: "api-target-verification",
          targetResults,
          verifiedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  },
});

async function ensureApiReady(baseUrl, target) {
  const fixtures = createMusicFixtureApiFixtures({ target });

  try {
    await invokeFixture(baseUrl, fixtures.control.state);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `API verification could not reach ${baseUrl}. Start the local app with \`pnpm dev\`, the local Postgres stack with \`pnpm dev:alchemy\`, the Node harness with \`pnpm dev:api\`, and seed the catalog with \`pnpm seed:ztunes\`. Cause: ${message}`,
    );
  }
}

async function verifyTarget(baseUrl, target) {
  const fixtures = createMusicFixtureApiFixtures({ target });
  const targetStartedAt = performance.now();

  const resetState = await invokeFixture(baseUrl, fixtures.control.reset);
  assertDemoState(resetState, target, "reset");
  assertCartState(resetState, 0, false, "reset");

  const directAddResponse = await invokeFixtureDetailed(baseUrl, fixtures.directMutators.cartAdd);
  assertServerHeaders(directAddResponse.response, target, "direct-mutator add");
  const afterDirectAdd = await invokeFixture(baseUrl, fixtures.demoQueries.state);
  assertDemoState(afterDirectAdd, target, "direct-mutator add");
  assertCartState(afterDirectAdd, 1, true, "direct-mutator add");

  await invokeFixture(baseUrl, fixtures.directMutators.cartRemove);
  const afterDirectRemove = await invokeFixture(baseUrl, fixtures.demoQueries.state);
  assertDemoState(afterDirectRemove, target, "direct-mutator remove");
  assertCartState(afterDirectRemove, 0, false, "direct-mutator remove");

  await invokeFixture(baseUrl, fixtures.control.reset);
  const zeroMutateResponse = await invokeFixtureDetailed(baseUrl, fixtures.zero.mutateCartAdd);
  assertServerHeaders(zeroMutateResponse.response, target, "zero mutate");
  assertZeroMutatePayload(zeroMutateResponse.payload, target);

  const [queryArtistResult, queryCartItemsResult, queryListArtistsResult, afterZeroMutate] =
    await Promise.all([
      invokeFixture(baseUrl, fixtures.zero.queryArtist),
      invokeFixture(baseUrl, fixtures.zero.queryCartItems),
      invokeFixture(baseUrl, fixtures.zero.queryListArtists),
      invokeFixture(baseUrl, fixtures.demoQueries.state),
    ]);

  assertZeroQueryPayload(queryArtistResult, target, "getArtist");
  assertZeroQueryPayload(queryCartItemsResult, target, "getCartItems");
  assertZeroQueryPayload(queryListArtistsResult, target, "listArtists");
  assertDemoState(afterZeroMutate, target, "zero mutate readback");
  assertCartState(afterZeroMutate, 1, true, "zero mutate readback");

  const zqlArtistResponse = await invokeFixtureDetailed(baseUrl, fixtures.zql.readArtist);
  const [zqlCartItemsResult, zqlListArtistsResult] = await Promise.all([
    invokeFixture(baseUrl, fixtures.zql.readCartItems),
    invokeFixture(baseUrl, fixtures.zql.readListArtists),
  ]);

  assertServerHeaders(zqlArtistResponse.response, target, "zql read");
  assertZqlReadPayload(zqlArtistResponse.payload, "getArtist");
  assertZqlReadPayload(zqlCartItemsResult, "getCartItems");
  assertZqlReadPayload(zqlListArtistsResult, "listArtists");

  return {
    durationMs: Number((performance.now() - targetStartedAt).toFixed(2)),
    target,
    verifiedOperations: [
      "POST /api/demo/reset",
      "POST /api/mutators/cart/add",
      "POST /api/mutators/cart/remove",
      "POST /api/zero/mutate",
      "POST /api/zero/query (getArtist)",
      "POST /api/zero/query (getCartItems)",
      "POST /api/zero/query (listArtists)",
      "POST /api/zql/read (getArtist)",
      "POST /api/zql/read (getCartItems)",
      "POST /api/zql/read (listArtists)",
      "GET /api/demo/state",
    ],
  };
}

function assertDemoState(payload, target, phase) {
  if (!isObject(payload) || !Array.isArray(payload.artists) || !isObject(payload.protocol)) {
    throw new Error(`Unexpected demo state payload during ${phase}: ${formatPayload(payload)}`);
  }

  if (payload.protocol.target !== target) {
    throw new Error(
      `Expected protocol target ${target} during ${phase}, received ${String(payload.protocol.target)}`,
    );
  }
}

function assertCartState(payload, expectedCount, expectAlbumInCart, phase) {
  if (!Array.isArray(payload.cartItems)) {
    throw new Error(`Missing cart items during ${phase}: ${formatPayload(payload)}`);
  }

  if (payload.cartItems.length !== expectedCount) {
    throw new Error(
      `Expected ${expectedCount} cart items during ${phase}, received ${payload.cartItems.length}`,
    );
  }

  if (!isObject(payload.selectedArtist) || !Array.isArray(payload.selectedArtist.albums)) {
    throw new Error(`Missing selected artist during ${phase}: ${formatPayload(payload)}`);
  }

  const album = payload.selectedArtist.albums.find(
    (candidate) => isObject(candidate) && candidate.id === MUSIC_FIXTURE_API_DEFAULTS.albumId,
  );

  if (!isObject(album) || album.inCart !== expectAlbumInCart) {
    throw new Error(
      `Expected album ${MUSIC_FIXTURE_API_DEFAULTS.albumId} inCart=${String(expectAlbumInCart)} during ${phase}: ${formatPayload(payload.selectedArtist)}`,
    );
  }
}

function assertZeroMutatePayload(payload, target) {
  if (!isObject(payload) || !Array.isArray(payload.mutations) || payload.mutations.length === 0) {
    throw new Error(`Unexpected zero mutate payload for ${target}: ${formatPayload(payload)}`);
  }
}

function assertZeroQueryPayload(payload, target, queryName) {
  if (!Array.isArray(payload) || payload[0] !== "transformed" || !Array.isArray(payload[1])) {
    throw new Error(
      `Unexpected zero query payload for ${target}/${queryName}: ${formatPayload(payload)}`,
    );
  }
}

function assertZqlReadPayload(payload, queryName) {
  if (payload === undefined) {
    throw new Error(`Unexpected zql read payload for ${queryName}: ${formatPayload(payload)}`);
  }
}

function assertServerHeaders(response, target, phase) {
  const actualDbApi = response.headers.get("x-effect-zero-server-db-api");
  const expectedDbApi = expectedServerDbApi(target);
  const actualAuthoringMode = response.headers.get("x-effect-zero-authoring-mode");
  const expectedAuthoringModeValue = expectedAuthoringMode(target);

  if (actualDbApi !== expectedDbApi) {
    throw new Error(
      `Expected x-effect-zero-server-db-api=${expectedDbApi} for ${target} during ${phase}, received ${String(actualDbApi)}`,
    );
  }

  if (actualAuthoringMode !== expectedAuthoringModeValue) {
    throw new Error(
      `Expected x-effect-zero-authoring-mode=${expectedAuthoringModeValue} for ${target} during ${phase}, received ${String(actualAuthoringMode)}`,
    );
  }
}

function expectedServerDbApi(target) {
  if (target === "control") {
    return "zero-postgresjs";
  }

  if (target.endsWith("-drizzle")) {
    return "wrapped-transaction";
  }

  return "raw-sql";
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
