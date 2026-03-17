import { createFileRoute } from "@tanstack/react-router";
import { handlePromiseDirectDrizzleCartAdd } from "#app/server/promise-handler.ts";
import { proxyExampleApiRequest } from "#app/server/proxy.ts";
import { createTargetHeaders, isProxyTarget, readTargetFromRequest } from "#app/server/targets.ts";

export const Route = createFileRoute("/api/direct/cart/add")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const target = readTargetFromRequest(request);

        if (isProxyTarget(target)) {
          return proxyExampleApiRequest(request);
        }

        const body = (await request.json().catch(() => ({}))) as {
          readonly addedAt?: number;
          readonly albumId?: string;
        };

        return Response.json(await handlePromiseDirectDrizzleCartAdd(body), {
          headers: createTargetHeaders(target, "drizzle-direct"),
        });
      },
    },
  },
});
