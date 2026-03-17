export const defaultApiBaseUrl = "http://localhost:4311";
export const defaultDatabaseUrl = "postgresql://postgres:postgres@127.0.0.1:5438/effect_zero";

function withQuietNotices(connectionString: string) {
  const url = new URL(connectionString);
  const existingOptions = url.searchParams.get("options");
  const quietNoticeOption = "-c client_min_messages=warning";

  if (!existingOptions) {
    url.searchParams.set("options", quietNoticeOption);
    return url.toString();
  }

  if (existingOptions.includes("client_min_messages")) {
    return url.toString();
  }

  url.searchParams.set("options", `${existingOptions} ${quietNoticeOption}`);
  return url.toString();
}

export function getApiBaseUrl() {
  return process.env.EFFECT_ZERO_API_BASE_URL?.trim() || defaultApiBaseUrl;
}

export function getDatabaseUrl() {
  return withQuietNotices(
    process.env.EFFECT_ZERO_DATABASE_URL?.trim() ||
      process.env.DATABASE_URL?.trim() ||
      process.env.PGURL?.trim() ||
      defaultDatabaseUrl,
  );
}

export function getListenHost() {
  return process.env.HOST?.trim() || "localhost";
}

export function getListenPort() {
  return Number.parseInt(process.env.PORT?.trim() || "4311", 10);
}
