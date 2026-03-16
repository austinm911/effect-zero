import { env as workerEnv } from "cloudflare:workers";

const defaultApiBaseUrl = "http://effect-zero-api.localhost:1355";

export function getExampleApiBaseUrl() {
  return (
    __EFFECT_ZERO_API_INTERNAL_URL__ ||
    __EFFECT_ZERO_API_BASE_URL__ ||
    process.env.EFFECT_ZERO_API_INTERNAL_URL?.trim() ||
    process.env.EFFECT_ZERO_API_BASE_URL?.trim() ||
    workerEnv.EFFECT_ZERO_API_INTERNAL_URL?.trim() ||
    workerEnv.EFFECT_ZERO_API_BASE_URL?.trim() ||
    defaultApiBaseUrl
  );
}

export async function proxyExampleApiRequest(request: Request) {
  const upstreamUrl = new URL(request.url);
  const baseUrl = new URL(getExampleApiBaseUrl());

  upstreamUrl.protocol = baseUrl.protocol;
  upstreamUrl.host = baseUrl.host;

  const headers = new Headers(request.headers);
  headers.delete("host");

  const body =
    request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer();
  let response: Response;

  try {
    response = await fetch(upstreamUrl, {
      body,
      headers,
      method: request.method,
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "effect-zero-example-api-proxy-error",
        message: error instanceof Error ? error.message : String(error),
        requestUrl: request.url,
        upstreamUrl: upstreamUrl.toString(),
      }),
    );
    throw error;
  }

  return new Response(await response.arrayBuffer(), {
    headers: response.headers,
    status: response.status,
  });
}
