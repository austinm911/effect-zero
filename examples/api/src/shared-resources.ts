import {
  createDirectDrizzleDatabaseFromSql,
  type QueryRows,
} from "@effect-zero/example-data/server-fixture";
import postgres from "postgres";
import { getDatabaseUrl } from "./config.ts";

let sharedSqlClient: postgres.Sql<Record<string, unknown>> | undefined;

export function getSharedSqlClient() {
  if (!sharedSqlClient) {
    sharedSqlClient = postgres(getDatabaseUrl(), {
      max: 10,
      onnotice: () => {},
      prepare: false,
    });
  }

  return sharedSqlClient;
}

export const queryRows: QueryRows = async (sql, params = []) => {
  return getSharedSqlClient().unsafe(sql, [...params]);
};

export function getSharedDirectDrizzleDb() {
  return createDirectDrizzleDatabaseFromSql(getSharedSqlClient());
}

export async function disposeSharedResources() {
  if (!sharedSqlClient) {
    return;
  }

  const client = sharedSqlClient;
  sharedSqlClient = undefined;
  await client.end({ timeout: 0 });
}
