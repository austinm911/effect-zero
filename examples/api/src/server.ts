import { serve } from "@hono/node-server";
import {
  MUSIC_FIXTURE_API_DEFAULTS,
  getMusicFixtureApiTargetSpec,
  musicFixtureApiTargetIds,
  parseMusicFixtureApiTarget,
  parseMusicFixtureMutatorName,
} from "@effect-zero/test-utils/api-fixtures";
import {
  readMusicFixtureDemoState,
  readMusicFixtureProtocolState,
  resetMusicFixtureState,
  runDirectDrizzleCartAdd,
  runDirectDrizzleRead,
} from "@effect-zero/example-data/server-fixture";
import { Hono } from "hono";
import { getListenHost, getListenPort } from "./config.ts";
import { disposeSharedResources, getSharedDirectDrizzleDb, queryRows } from "./shared-resources.ts";
import {
  disposeTargetRuntimes,
  getTargetRuntime,
  readTargetAuthoringState,
  resetTargetAuthoringState,
} from "./targets.ts";

const TARGET_COOKIE = "effect-zero-target";

const app = new Hono();

app.get("/", (c) =>
  c.json({
    name: "@effect-zero/example-api",
    ok: true,
    targets: musicFixtureApiTargetIds,
  }),
);

app.post("/api/target", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { target?: string };
  const target = parseMusicFixtureApiTarget(body.target);

  return c.json({ ok: true, target }, 200, {
    ...createTargetHeaders(target, "fixture-sql"),
    "Set-Cookie": `${TARGET_COOKIE}=${target}; Path=/; SameSite=Lax; Max-Age=31536000`,
  });
});

app.post("/api/demo/reset", async (c) => {
  const target = readTargetFromRequest(c.req.raw);
  resetTargetAuthoringState(target);
  await resetMusicFixtureState(queryRows);
  const payload = await readMusicFixtureDemoState(queryRows, {
    target,
    userId: MUSIC_FIXTURE_API_DEFAULTS.userId,
  });

  return c.json(payload, 200, createTargetHeaders(target, "fixture-sql"));
});

app.get("/api/demo/state", async (c) => {
  const target = readTargetFromRequest(c.req.raw);
  const payload = await readMusicFixtureDemoState(queryRows, {
    artistId: c.req.query("artistId") || undefined,
    search: c.req.query("search") || undefined,
    target,
    userId: MUSIC_FIXTURE_API_DEFAULTS.userId,
  });

  return c.json(payload, 200, createTargetHeaders(target, "fixture-sql"));
});

app.get("/api/demo/protocol-state", async (c) => {
  const target = readTargetFromRequest(c.req.raw);
  const payload = await readMusicFixtureProtocolState(queryRows, {
    clientGroupID: c.req.query("clientGroupID") || undefined,
    clientID: c.req.query("clientID") || undefined,
    target,
    userId: c.req.query("userId") || undefined,
  });

  return c.json(
    {
      ...payload,
      authoring: readTargetAuthoringState(target),
    },
    200,
    createTargetHeaders(target, "fixture-sql"),
  );
});

app.post("/api/direct/cart/add", async (c) => {
  const body = await c.req.json<{
    addedAt?: number;
    albumId?: string;
    __benchmarkUserId?: string;
  }>();
  const payload = await runDirectDrizzleCartAdd(getSharedDirectDrizzleDb(), {
    addedAt: body.addedAt ?? MUSIC_FIXTURE_API_DEFAULTS.timestamp,
    albumId: body.albumId ?? MUSIC_FIXTURE_API_DEFAULTS.albumId,
    userId: body.__benchmarkUserId ?? MUSIC_FIXTURE_API_DEFAULTS.userId,
  });

  return c.json(payload, 200, createTargetHeaders("control", "drizzle-direct"));
});

app.post("/api/direct/read", async (c) => {
  const body = await c.req.json<{
    args?: Record<string, unknown>;
    name?: string;
    __benchmarkUserId?: string;
  }>();

  if (typeof body.name !== "string") {
    return c.json({ error: "Expected a direct read body with a query name." }, 400);
  }

  const payload = await runDirectDrizzleRead(
    getSharedDirectDrizzleDb(),
    {
      args: body.args,
      name: body.name as any,
    },
    body.__benchmarkUserId ?? MUSIC_FIXTURE_API_DEFAULTS.userId,
  );

  return c.json(payload, 200, createTargetHeaders("control", "drizzle-direct"));
});

app.post("/api/mutators/:scope/:name", async (c) => {
  const target = readRequiredTargetFromRequest(c.req.raw);

  if (!target) {
    return c.json({ error: "Expected ?target=<id> or effect-zero-target cookie." }, 400);
  }

  const runtime = getTargetRuntime(target);
  const mutatorName = parseMusicFixtureMutatorName(
    `${c.req.param("scope")}/${c.req.param("name")}`,
  );

  if (!mutatorName) {
    return c.json({ error: "Unknown mutator path." }, 404);
  }

  const args = await c.req
    .json<import("@rocicorp/zero").ReadonlyJSONValue>()
    .catch(() => undefined);
  await runtime.directMutate(mutatorName, args);

  return c.json({ ok: true }, 200, createTargetHeaders(target, runtime.serverDbApi));
});

app.post("/api/zero/mutate", async (c) => {
  const target = readRequiredTargetFromRequest(c.req.raw);

  if (!target) {
    return c.json({ error: "Expected ?target=<id> or effect-zero-target cookie." }, 400);
  }

  const runtime = getTargetRuntime(target);
  const payload = await runtime.mutate(c.req.raw);

  return c.json(payload, 200, createTargetHeaders(target, runtime.serverDbApi));
});

app.post("/api/zero/query", async (c) => {
  const target = readRequiredTargetFromRequest(c.req.raw);

  if (!target) {
    return c.json({ error: "Expected ?target=<id> or effect-zero-target cookie." }, 400);
  }

  const runtime = getTargetRuntime(target);
  const payload = await runtime.query(c.req.raw);

  return c.json(payload, 200, createTargetHeaders(target, runtime.serverDbApi));
});

app.post("/api/zql/read", async (c) => {
  const target = readRequiredTargetFromRequest(c.req.raw);

  if (!target) {
    return c.json({ error: "Expected ?target=<id> or effect-zero-target cookie." }, 400);
  }

  const runtime = getTargetRuntime(target);
  const body = (await c.req.json().catch(() => ({}))) as {
    readonly args?: import("@rocicorp/zero").ReadonlyJSONValue;
    readonly name?: string;
  };

  if (typeof body.name !== "string") {
    return c.json({ error: "Expected a ZQL read body with a query name." }, 400);
  }

  const payload = await runtime.zqlRead({
    args: body.args,
    name: body.name,
  });

  return c.json(payload, 200, createTargetHeaders(target, runtime.serverDbApi));
});

const server = serve({
  fetch: app.fetch,
  hostname: getListenHost(),
  port: getListenPort(),
});

console.log(
  JSON.stringify({
    event: "effect-zero-api-started",
    host: getListenHost(),
    port: getListenPort(),
  }),
);

const shutdown = async () => {
  server.close();
  await Promise.all([disposeTargetRuntimes(), disposeSharedResources()]);
  process.exit(0);
};

process.on("SIGINT", () => {
  void shutdown();
});

process.on("SIGTERM", () => {
  void shutdown();
});

function readTargetFromRequest(request: Request) {
  const explicitTarget = readExplicitTargetFromRequest(request);
  return parseMusicFixtureApiTarget(explicitTarget);
}

function readRequiredTargetFromRequest(request: Request) {
  const explicitTarget = readExplicitTargetFromRequest(request);

  if (!explicitTarget) {
    return undefined;
  }

  const normalized = explicitTarget.trim().toLowerCase();
  return musicFixtureApiTargetIds.includes(normalized as (typeof musicFixtureApiTargetIds)[number])
    ? parseMusicFixtureApiTarget(normalized)
    : undefined;
}

function readExplicitTargetFromRequest(request: Request) {
  const url = new URL(request.url);
  const queryTarget = url.searchParams.get("target");

  if (queryTarget) {
    return queryTarget;
  }

  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`${TARGET_COOKIE}=([^;]+)`));
  return match?.[1]?.trim();
}

function createTargetHeaders(
  target: ReturnType<typeof readTargetFromRequest>,
  serverDbApi: string,
) {
  const spec = getMusicFixtureApiTargetSpec(target);

  return {
    "x-effect-zero-adapter": spec.adapter,
    "x-effect-zero-authoring-mode": readTargetAuthoringState(target).mode,
    "x-effect-zero-runtime": spec.runtime,
    "x-effect-zero-server-db-api": serverDbApi,
    "x-effect-zero-target": target,
  };
}
