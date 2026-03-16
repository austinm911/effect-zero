import { createFileRoute } from "@tanstack/react-router";
import { handlePromiseProtocolState } from "#app/server/promise-handler.ts";
import { proxyExampleApiRequest } from "#app/server/proxy.ts";
import { createTargetHeaders, isProxyTarget, readTargetFromRequest } from "#app/server/targets.ts";

export const Route = createFileRoute("/api/demo/protocol-state")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const target = readTargetFromRequest(request);

        if (isProxyTarget(target)) {
          return proxyExampleApiRequest(request);
        }

        const url = new URL(request.url);
        const payload = await handlePromiseProtocolState({
          clientGroupID: url.searchParams.get("clientGroupID") || undefined,
          clientID: url.searchParams.get("clientID") || undefined,
          target,
          userId: url.searchParams.get("userId") || undefined,
        });

        return Response.json(
          {
            ...payload,
            authoring: {
              afterCommitRuns: 0,
              mode: "shared-client-mutator",
              rawSqlMutations: 0,
              servicePlanRuns: 0,
              wrappedTransactionReads: 0,
            },
          },
          { headers: createTargetHeaders(target, "fixture-sql") },
        );
      },
    },
  },
});
