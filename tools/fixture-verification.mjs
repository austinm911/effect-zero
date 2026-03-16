import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function resolveRepoRoot(importMetaUrl) {
  const filename = fileURLToPath(importMetaUrl);
  const directory = path.dirname(filename);
  return path.resolve(directory, "..");
}

export function formatPayload(payload) {
  return typeof payload === "string" ? payload : JSON.stringify(payload);
}

export function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export async function invokeFixture(baseUrl, fixture, options = {}) {
  return (await invokeFixtureDetailed(baseUrl, fixture, options)).payload;
}

export async function invokeFixtureDetailed(baseUrl, fixture, options = {}) {
  const { requestTimeoutMs } = options;
  const abortController = new AbortController();
  const timeout =
    requestTimeoutMs === undefined
      ? undefined
      : setTimeout(() => {
          abortController.abort(
            new Error(
              `Timed out after ${requestTimeoutMs}ms calling ${fixture.method} ${fixture.path}`,
            ),
          );
        }, requestTimeoutMs);

  let response;

  try {
    response = await requestWithPortlessLookup(`${baseUrl}${fixture.path}`, {
      body: fixture.body === undefined ? undefined : JSON.stringify(fixture.body),
      headers: fixture.body === undefined ? undefined : { "content-type": "application/json" },
      method: fixture.method,
      signal: abortController.signal,
    });
  } catch (error) {
    throw new Error(
      `${fixture.id} request failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }

  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    throw new Error(`${fixture.id} failed with ${response.status}: ${formatPayload(payload)}`);
  }

  return {
    payload,
    response,
  };
}

export function parseArgs(argv) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token?.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const nextToken = argv[index + 1];

    if (!nextToken || nextToken.startsWith("--")) {
      parsed[key] = "true";
      continue;
    }

    parsed[key] = nextToken;
    index += 1;
  }

  return parsed;
}

export function parseCsvFilter(rawValue) {
  if (!rawValue) {
    return null;
  }

  return new Set(
    String(rawValue)
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

export function parsePositiveInteger(rawValue, fallback, label) {
  if (rawValue === undefined) {
    return fallback;
  }

  const parsed = Number.parseInt(String(rawValue), 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Expected --${label} to be a positive integer.`);
  }

  return parsed;
}

export function trimTrailingSlash(value) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export async function withFixtureVerificationLock({
  baseUrl,
  importMetaUrl,
  metadata = {},
  operation,
  task,
}) {
  const repoRoot = resolveRepoRoot(importMetaUrl);
  const verificationLockDir = path.resolve(repoRoot, "verification/.fixture-db.lock");

  await mkdir(path.dirname(verificationLockDir), { recursive: true });

  try {
    await mkdir(verificationLockDir);
  } catch (error) {
    if (isNodeError(error) && error.code === "EEXIST") {
      throw new Error(
        "Another local fixture verification run is already active. Do not run API verification, mutation stress, or other fixture-resetting checks concurrently.",
      );
    }

    throw error;
  }

  await writeFile(
    path.join(verificationLockDir, "owner.json"),
    `${JSON.stringify(
      {
        baseUrl,
        pid: process.pid,
        startedAt: new Date().toISOString(),
        task,
        ...metadata,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  try {
    return await operation({ repoRoot, verificationLockDir });
  } finally {
    await rm(verificationLockDir, { force: true, recursive: true });
  }
}

function isNodeError(value) {
  return value instanceof Error && "code" in value;
}

function lookupPortlessHostname(hostname, options, callback) {
  if (hostname.endsWith(".localhost")) {
    if (typeof options === "object" && options?.all) {
      callback(null, [{ address: "127.0.0.1", family: 4 }]);
      return;
    }

    callback(null, "127.0.0.1", 4);
    return;
  }

  dns.lookup(hostname, options, callback);
}

async function requestWithPortlessLookup(url, options) {
  const requestUrl = new URL(url);
  const transport = requestUrl.protocol === "https:" ? https : http;

  return await new Promise((resolve, reject) => {
    const request = transport.request(
      requestUrl,
      {
        headers: options.headers,
        lookup: lookupPortlessHostname,
        method: options.method,
        signal: options.signal,
      },
      (response) => {
        const chunks = [];

        response.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });

        response.on("end", () => {
          const bodyText = Buffer.concat(chunks).toString("utf8");
          const headers = new Headers();

          for (const [key, value] of Object.entries(response.headers)) {
            if (value === undefined) {
              continue;
            }

            if (Array.isArray(value)) {
              for (const entry of value) {
                headers.append(key, entry);
              }
              continue;
            }

            headers.set(key, value);
          }

          resolve({
            headers,
            json: async () => JSON.parse(bodyText),
            ok:
              typeof response.statusCode === "number" &&
              response.statusCode >= 200 &&
              response.statusCode < 300,
            status: response.statusCode ?? 500,
            text: async () => bodyText,
          });
        });
      },
    );

    request.on("error", reject);

    if (options.body !== undefined) {
      request.write(options.body);
    }

    request.end();
  });
}
