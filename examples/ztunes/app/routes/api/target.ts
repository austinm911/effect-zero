import { createFileRoute } from "@tanstack/react-router";
import { readBrowserTargetFromCookieValue, setTargetCookieHeader } from "#app/server/targets.ts";

export const Route = createFileRoute("/api/target")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as { target?: string };
        const target = readBrowserTargetFromCookieValue(body.target);

        return new Response(JSON.stringify({ ok: true, target }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie": setTargetCookieHeader(target),
          },
        });
      },
    },
  },
});
