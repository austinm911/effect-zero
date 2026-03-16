import { backendBindings, localPostgres } from "@effect-zero/alchemy/stack";
import alchemy, { type Scope } from "alchemy";
import { TanStackStart } from "alchemy/cloudflare";
import { FileSystemStateStore } from "alchemy/state";

const stateStore = (scope: Scope) => new FileSystemStateStore(scope);
const appRoot = import.meta.dirname;
const portlessName = "effect-zero-ztunes";
const portlessUrl = `http://${portlessName}.localhost:1355`;
const apiBaseUrl = process.env.EFFECT_ZERO_API_BASE_URL?.trim() || "http://effect-zero-api.localhost:1355";
const apiInternalUrl = process.env.EFFECT_ZERO_API_INTERNAL_URL?.trim() || apiBaseUrl;
const zeroCacheUrl = process.env.VITE_PUBLIC_ZERO_CACHE_URL?.trim() || "http://localhost:4848";

const app = await alchemy("ztunes", {
  stateStore,
});

export const ztunes = await TanStackStart("ztunes", {
  adopt: true,
  compatibility: "node",
  compatibilityFlags: ["no_handle_cross_request_promise_resolution"],
  cwd: appRoot,
  bindings: {
    APP_NAME: "effect-zero",
    EFFECT_ZERO_API_BASE_URL: apiBaseUrl,
    EFFECT_ZERO_API_INTERNAL_URL: apiInternalUrl,
    ...backendBindings,
  },
  dev: {
    command: `EFFECT_ZERO_API_BASE_URL=${apiBaseUrl} VITE_PUBLIC_ZERO_CACHE_URL=${zeroCacheUrl} portless --force ${portlessName} vite dev`,
  },
});

console.log("[ztunes] frontend", {
  postgresUrl: localPostgres.url,
  alchemyUrl: ztunes.url,
  apiBaseUrl,
  apiInternalUrl,
  url: portlessUrl,
  zeroCacheUrl,
});

await app.finalize();
