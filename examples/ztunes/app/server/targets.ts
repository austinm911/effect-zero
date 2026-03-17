import {
  getMusicFixtureApiTargetSpec,
  parseMusicFixtureApiTarget,
  type MusicFixtureApiTargetId,
} from "@effect-zero/test-utils/api-fixtures";
import {
  createTargetCookieValue,
  getBrowserTargetAuthoringMode,
  getBrowserTargetSpec,
  readBrowserTargetFromCookieValue as readSharedBrowserTargetFromCookieValue,
  TARGET_COOKIE,
  type BrowserTarget,
} from "#app/shared/targets.ts";

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
  return readSharedBrowserTargetFromCookieValue(readTargetFromRequest(request));
}

export function readBrowserTargetFromCookieValue(value: string | undefined): BrowserTarget {
  return readSharedBrowserTargetFromCookieValue(value);
}

export function setTargetCookieHeader(target: BrowserTarget): string {
  return createTargetCookieValue(target);
}

export function isProxyTarget(target: MusicFixtureApiTargetId) {
  return target !== "control";
}

export function createTargetHeaders(target: MusicFixtureApiTargetId, serverDbApi: string) {
  const targetSpec =
    target === "control" || target === "v3-drizzle" || target === "v4-drizzle"
      ? getBrowserTargetSpec(target)
      : getMusicFixtureApiTargetSpec(target);
  const authoringMode =
    target === "control" || target === "v3-drizzle" || target === "v4-drizzle"
      ? getBrowserTargetAuthoringMode(target)
      : targetSpec.adapter === "drizzle"
        ? "service-workflow"
        : "raw-sql";

  return {
    "x-effect-zero-adapter": targetSpec.adapter,
    "x-effect-zero-authoring-mode": authoringMode,
    "x-effect-zero-runtime": targetSpec.runtime,
    "x-effect-zero-server-db-api": serverDbApi,
    "x-effect-zero-target": target,
  };
}
