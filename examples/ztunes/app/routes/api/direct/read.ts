import { createFileRoute } from "@tanstack/react-router";
import { handlePromiseDirectRead } from "#app/server/promise-handler.ts";
import { proxyExampleApiRequest } from "#app/server/proxy.ts";
import { createTargetHeaders, isProxyTarget, readTargetFromRequest } from "#app/server/targets.ts";

export const Route = createFileRoute("/api/direct/read")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const target = readTargetFromRequest(request);

        if (isProxyTarget(target)) {
          return proxyExampleApiRequest(request);
        }

        const body = (await request.json().catch(() => ({}))) as {
          readonly __benchmarkUserId?: string;
          readonly args?: Record<string, unknown>;
          readonly name?: string;
        };

        if (typeof body.name !== "string") {
          return Response.json({ error: "Direct read query name required." }, { status: 400 });
        }

        return Response.json(
          await handlePromiseDirectRead({
            __benchmarkUserId: body.__benchmarkUserId,
            args: body.args,
            name: body.name,
          }),
          {
            headers: createTargetHeaders(target, "drizzle-direct"),
          },
        );
      },
    },
  },
});
