import { createFileRoute } from "@tanstack/react-router";
import type { ReadonlyJSONValue } from "@rocicorp/zero";
import { handlePromiseDirectMutate } from "#app/server/promise-handler.ts";
import { proxyExampleApiRequest } from "#app/server/proxy.ts";
import { createTargetHeaders, isProxyTarget, readTargetFromRequest } from "#app/server/targets.ts";

function parseMutatorName(splat: string | undefined): string | undefined {
  if (!splat) return undefined;
  const parts = splat
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return undefined;
  try {
    return parts.map((p) => decodeURIComponent(p)).join(".");
  } catch {
    return undefined;
  }
}

export const Route = createFileRoute("/api/mutators/$")({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        const target = readTargetFromRequest(request);

        if (isProxyTarget(target)) {
          return proxyExampleApiRequest(request);
        }

        const mutatorName = parseMutatorName(params._splat);
        if (!mutatorName) {
          return Response.json(
            { error: "Mutator name required, e.g. /api/mutators/cart/add" },
            { status: 400 },
          );
        }

        let args: ReadonlyJSONValue | undefined;
        const contentType = request.headers.get("content-type");
        if (contentType?.includes("application/json")) {
          try {
            args = (await request.json()) as ReadonlyJSONValue;
          } catch {
            return Response.json({ error: "Invalid JSON body." }, { status: 400 });
          }
        }

        try {
          await handlePromiseDirectMutate(mutatorName, args);
          return Response.json(
            { ok: true },
            {
              headers: createTargetHeaders(target, "zero-postgresjs"),
            },
          );
        } catch (error) {
          return Response.json(
            { error: error instanceof Error ? error.message : "Mutation failed." },
            { status: 400 },
          );
        }
      },
    },
  },
});
