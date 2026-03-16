export const defaultApiBaseUrl = "http://effect-zero-api.localhost:1355";
export const defaultDatabaseUrl = "postgresql://postgres:postgres@127.0.0.1:5438/effect_zero";

export function getApiBaseUrl() {
  return process.env.EFFECT_ZERO_API_BASE_URL?.trim() || defaultApiBaseUrl;
}

export function getDatabaseUrl() {
  return (
    process.env.EFFECT_ZERO_DATABASE_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    process.env.PGURL?.trim() ||
    defaultDatabaseUrl
  );
}

export function getListenHost() {
  return process.env.HOST?.trim() || "127.0.0.1";
}

export function getListenPort() {
  return Number.parseInt(process.env.PORT?.trim() || "3210", 10);
}
