import { createFileRoute } from "@tanstack/react-router";
import { handlePromiseDemoReset } from "#app/server/promise-handler.ts";
import { proxyExampleApiRequest } from "#app/server/proxy.ts";
import { createTargetHeaders, isProxyTarget, readTargetFromRequest } from "#app/server/targets.ts";

export const Route = createFileRoute("/api/demo/reset")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const target = readTargetFromRequest(request);

        if (isProxyTarget(target)) {
          return proxyExampleApiRequest(request);
        }

        return Response.json(await handlePromiseDemoReset(target), {
          headers: createTargetHeaders(target, "fixture-sql"),
        });
      },
    },
  },
});
