import { localPostgresDefaults } from "@effect-zero/alchemy";
import alchemy, { type Scope } from "alchemy";
import { TanStackStart } from "alchemy/cloudflare";
import { FileSystemStateStore } from "alchemy/state";

const stateStore = (scope: Scope) => new FileSystemStateStore(scope);
const appRoot = import.meta.dirname;
const appUrl = "http://localhost:4310";
const postgresConfig = {
  user: process.env.EFFECT_ZERO_PG_USER?.trim() || localPostgresDefaults.user,
  password: process.env.EFFECT_ZERO_PG_PASSWORD?.trim() || localPostgresDefaults.password,
  database: process.env.EFFECT_ZERO_PG_DATABASE?.trim() || localPostgresDefaults.database,
  port: Number.parseInt(
    process.env.EFFECT_ZERO_PG_PORT?.trim() || String(localPostgresDefaults.port),
    10,
  ),
};
const postgresUrl =
  `postgres://${postgresConfig.user}:${postgresConfig.password}@localhost:${postgresConfig.port}/${postgresConfig.database}` as const;
const apiBaseUrl = process.env.EFFECT_ZERO_API_BASE_URL?.trim() || "http://localhost:4311";
const apiInternalUrl = process.env.EFFECT_ZERO_API_INTERNAL_URL?.trim() || apiBaseUrl;
const zeroCacheUrl = process.env.VITE_PUBLIC_ZERO_CACHE_URL?.trim() || "http://localhost:4848";

const app = await alchemy("ztunes", {
  stateStore,
});
const stage = app.stage;

export const ztunes = await TanStackStart("ztunes", {
  adopt: true,
  compatibility: "node",
  compatibilityFlags: ["no_handle_cross_request_promise_resolution"],
  cwd: appRoot,
  bindings: {
    APP_NAME: "effect-zero",
    EFFECT_ZERO_API_BASE_URL: apiBaseUrl,
    EFFECT_ZERO_API_INTERNAL_URL: apiInternalUrl,
    APP_STAGE: stage,
    PG_DATABASE: postgresConfig.database,
    PG_PORT: String(postgresConfig.port),
    PG_URL: postgresUrl,
  },
  dev: {
    command: "vite dev --host localhost --port 4310 --strictPort",
  },
});

console.log("[ztunes] frontend", {
  postgresUrl,
  alchemyUrl: ztunes.url,
  apiBaseUrl,
  apiInternalUrl,
  url: appUrl,
  zeroCacheUrl,
});

await app.finalize();
