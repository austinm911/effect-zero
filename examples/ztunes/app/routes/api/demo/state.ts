import { createFileRoute } from "@tanstack/react-router";
import { handlePromiseDemoState } from "#app/server/promise-handler.ts";
import { proxyExampleApiRequest } from "#app/server/proxy.ts";
import { createTargetHeaders, isProxyTarget, readTargetFromRequest } from "#app/server/targets.ts";

export const Route = createFileRoute("/api/demo/state")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const target = readTargetFromRequest(request);

        if (isProxyTarget(target)) {
          return proxyExampleApiRequest(request);
        }

        const url = new URL(request.url);
        return Response.json(
          await handlePromiseDemoState({
            artistId: url.searchParams.get("artistId") || undefined,
            search: url.searchParams.get("search") || undefined,
            target,
          }),
          { headers: createTargetHeaders(target, "fixture-sql") },
        );
      },
    },
  },
});
