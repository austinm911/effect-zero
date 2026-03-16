import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import type { Zero } from "@rocicorp/zero";
import type { Schema } from "@effect-zero/example-data/zero";
import { routeTree } from "./routeTree.gen";

export interface RouterContext {
  zero: Zero<Schema>;
}

export function getRouter() {
  return createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    defaultPreloadGcTime: 0,
    context: {
      zero: undefined as unknown as Zero<Schema>,
    } satisfies RouterContext,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
