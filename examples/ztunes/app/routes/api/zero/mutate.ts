import { createFileRoute } from "@tanstack/react-router";
import { handlePromiseMutate } from "#app/server/promise-handler.ts";
import { proxyExampleApiRequest } from "#app/server/proxy.ts";
import { createTargetHeaders, isProxyTarget, readTargetFromRequest } from "#app/server/targets.ts";

export const Route = createFileRoute("/api/zero/mutate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const target = readTargetFromRequest(request);

        if (isProxyTarget(target)) {
          return proxyExampleApiRequest(request);
        }

        return Response.json(await handlePromiseMutate(request), {
          headers: createTargetHeaders(target, "zero-postgresjs"),
        });
      },
    },
  },
});
