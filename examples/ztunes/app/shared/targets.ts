export const TARGET_COOKIE = "effect-zero-target";
export const browserTargets = ["control", "v3-drizzle", "v4-drizzle"] as const;
export type BrowserTarget = (typeof browserTargets)[number];
export type BrowserTargetRuntime = "control" | "v3" | "v4";
export type BrowserTargetAdapter = "control" | "drizzle";
export type BrowserTargetAuthoringMode =
  | "shared-client-mutator"
  | "service-workflow"
  | "raw-sql";

export const defaultBrowserTarget = "control" as const satisfies BrowserTarget;

const browserTargetSet = new Set<string>(browserTargets);
const browserTargetSpecs = {
  control: {
    adapter: "control",
    runtime: "control",
  },
  "v3-drizzle": {
    adapter: "drizzle",
    runtime: "v3",
  },
  "v4-drizzle": {
    adapter: "drizzle",
    runtime: "v4",
  },
} as const satisfies Record<
  BrowserTarget,
  { readonly adapter: BrowserTargetAdapter; readonly runtime: BrowserTargetRuntime }
>;

export const browserTargetLabels: Record<BrowserTarget, string> = {
  control: "Promise",
  "v3-drizzle": "Effect v3 (Drizzle)",
  "v4-drizzle": "Effect v4 (Drizzle)",
};

export function createTargetCookieValue(target: BrowserTarget): string {
  return `${TARGET_COOKIE}=${target}; Path=/; SameSite=Lax; Max-Age=31536000`;
}

export function readBrowserTargetFromCookieValue(value: string | undefined): BrowserTarget {
  return coerceBrowserTarget(value);
}

export function readBrowserTargetFromCookieString(cookie: string): BrowserTarget {
  const match = cookie.match(new RegExp(`${TARGET_COOKIE}=([^;]+)`));
  return readBrowserTargetFromCookieValue(match?.[1]?.trim());
}

export function getBrowserTargetAuthoringMode(target: BrowserTarget): BrowserTargetAuthoringMode {
  return target === "control" ? "shared-client-mutator" : "service-workflow";
}

export function getBrowserTargetSpec(target: BrowserTarget) {
  return browserTargetSpecs[target];
}

function coerceBrowserTarget(value: string | undefined): BrowserTarget {
  const normalized = value?.trim().toLowerCase();
  return normalized && browserTargetSet.has(normalized)
    ? (normalized as BrowserTarget)
    : defaultBrowserTarget;
}
