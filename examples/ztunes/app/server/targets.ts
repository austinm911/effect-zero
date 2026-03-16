import {
  parseMusicFixtureApiTarget,
  type MusicFixtureApiTargetId,
} from "@effect-zero/test-utils/api-fixtures";

export const browserTargets = ["control", "v3-drizzle", "v4-drizzle"] as const;
export type BrowserTarget = (typeof browserTargets)[number];

export const defaultBrowserTarget = "control" as const satisfies BrowserTarget;

const TARGET_COOKIE = "effect-zero-target";
const browserTargetSet = new Set<string>(browserTargets);

export function readTargetFromRequest(request: Request): MusicFixtureApiTargetId {
  const url = new URL(request.url);
  const queryTarget = url.searchParams.get("target");

  if (queryTarget) {
    return parseMusicFixtureApiTarget(queryTarget);
  }

  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`${TARGET_COOKIE}=([^;]+)`));
  return parseMusicFixtureApiTarget(match?.[1]?.trim());
}

export function readBrowserTargetFromRequest(request: Request): BrowserTarget {
  return coerceBrowserTarget(readTargetFromRequest(request));
}

export function readBrowserTargetFromCookieValue(value: string | undefined): BrowserTarget {
  return coerceBrowserTarget(parseMusicFixtureApiTarget(value));
}

export function setTargetCookieHeader(target: BrowserTarget): string {
  return `${TARGET_COOKIE}=${target}; Path=/; SameSite=Lax; Max-Age=31536000`;
}

export const browserTargetLabels: Record<BrowserTarget, string> = {
  control: "Promise",
  "v3-drizzle": "Effect v3 (Drizzle)",
  "v4-drizzle": "Effect v4 (Drizzle)",
};

export function isProxyTarget(target: MusicFixtureApiTargetId) {
  return target !== "control";
}

export function createTargetHeaders(target: MusicFixtureApiTargetId, serverDbApi: string) {
  const runtime = target === "control" ? "control" : target.startsWith("v3-") ? "v3" : "v4";
  const adapter =
    target === "control"
      ? "control"
      : target.endsWith("-drizzle")
        ? "drizzle"
      : target.endsWith("-pg")
          ? "pg"
          : "postgresjs";
  const authoringMode =
    target === "control"
      ? "shared-client-mutator"
      : target.endsWith("-drizzle")
        ? "service-workflow"
        : "raw-sql";

  return {
    "x-effect-zero-adapter": adapter,
    "x-effect-zero-authoring-mode": authoringMode,
    "x-effect-zero-runtime": runtime,
    "x-effect-zero-server-db-api": serverDbApi,
    "x-effect-zero-target": target,
  };
}

function coerceBrowserTarget(target: MusicFixtureApiTargetId): BrowserTarget {
  return browserTargetSet.has(target) ? (target as BrowserTarget) : defaultBrowserTarget;
}
