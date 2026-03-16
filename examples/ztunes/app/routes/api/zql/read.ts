import { createFileRoute } from "@tanstack/react-router";
import type { ReadonlyJSONValue } from "@rocicorp/zero";
import { handlePromiseZqlRead } from "#app/server/promise-handler.ts";
import { proxyExampleApiRequest } from "#app/server/proxy.ts";
import { createTargetHeaders, isProxyTarget, readTargetFromRequest } from "#app/server/targets.ts";

export const Route = createFileRoute("/api/zql/read")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const target = readTargetFromRequest(request);

        if (isProxyTarget(target)) {
          return proxyExampleApiRequest(request);
        }

        const body = (await request.json().catch(() => ({}))) as {
          readonly args?: ReadonlyJSONValue;
          readonly name?: string;
        };

        if (typeof body.name !== "string") {
          return Response.json({ error: "ZQL read query name required." }, { status: 400 });
        }

        return Response.json(
          await handlePromiseZqlRead({
            args: body.args,
            name: body.name,
          }),
          {
            headers: createTargetHeaders(target, "zero-postgresjs"),
          },
        );
      },
    },
  },
});
