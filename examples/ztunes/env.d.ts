import "@tanstack/react-start";
import "@tanstack/react-start/server";
import type { ztunes } from "./alchemy.run.ts";

export type CloudflareEnv = typeof ztunes.Env;

declare global {
  type Env = CloudflareEnv;
  const __EFFECT_ZERO_API_BASE_URL__: string;
  const __EFFECT_ZERO_API_INTERNAL_URL__: string;
}

declare module "cloudflare:workers" {
  export const env: CloudflareEnv;

  namespace Cloudflare {
    interface Env extends CloudflareEnv {}
  }
}
