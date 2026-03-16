import { env as workerEnv } from "cloudflare:workers";
import postgres from "postgres";

export type SqlClient = postgres.Sql<Record<string, unknown>>;

export function getPgUrl(): string {
  const pgUrl = workerEnv.PG_URL?.trim();
  if (!pgUrl) throw new Error("PG_URL binding is missing.");
  return pgUrl;
}

export function createSqlClient(): SqlClient {
  return postgres(getPgUrl(), { max: 1, prepare: false });
}

export async function withSqlClient<T>(operation: (sql: SqlClient) => Promise<T>): Promise<T> {
  const sql = createSqlClient();
  try {
    return await operation(sql);
  } finally {
    await sql.end({ timeout: 0 });
  }
}
