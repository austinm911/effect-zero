import type { Schema as ZeroSchema } from "@rocicorp/zero";
import {
  type DBConnection,
  type DBTransaction,
  type Row,
  executePostgresQuery,
  ZQLDatabase,
} from "@rocicorp/zero/server";
import postgres from "postgres";
import type { EffectZeroProvider } from "../types.js";

export type PostgresJsTransaction<
  T extends Record<string, unknown> = Record<string, unknown>,
> = postgres.TransactionSql<T>;

type UnsafeParams<T extends Record<string, unknown>> = Parameters<PostgresJsTransaction<T>["unsafe"]>[1];

class PostgresJsConnection<T extends Record<string, unknown>>
  implements DBConnection<PostgresJsTransaction<T>>
{
  readonly #sql: postgres.Sql<T>;

  constructor(sql: postgres.Sql<T>) {
    this.#sql = sql;
  }

  transaction<TReturn>(
    callback: (tx: DBTransaction<PostgresJsTransaction<T>>) => Promise<TReturn>,
  ): Promise<TReturn> {
    return this.#sql.begin((transactionSql: PostgresJsTransaction<T>) => {
      return callback(new PostgresJsTransactionInternal(transactionSql));
    }) as Promise<TReturn>;
  }
}

class PostgresJsTransactionInternal<T extends Record<string, unknown>>
  implements DBTransaction<PostgresJsTransaction<T>>
{
  readonly wrappedTransaction: PostgresJsTransaction<T>;

  constructor(transactionSql: PostgresJsTransaction<T>) {
    this.wrappedTransaction = transactionSql;
  }

  readonly query: DBTransaction<PostgresJsTransaction<T>>["query"] = (sql, params) => {
    return this.wrappedTransaction.unsafe(sql, params as UnsafeParams<T>) as Promise<Row[]>;
  };

  readonly runQuery: DBTransaction<PostgresJsTransaction<T>>["runQuery"] = (
    ast,
    format,
    schema,
    serverSchema,
  ) => {
    return executePostgresQuery(this, ast, format, schema, serverSchema);
  };
}

export function zeroEffectPostgresJS<
  TZeroSchema extends ZeroSchema,
  T extends Record<string, unknown> = Record<string, unknown>,
>(schema: TZeroSchema, sql: postgres.Sql<T> | string): EffectZeroProvider<TZeroSchema, PostgresJsTransaction<T>> {
  const client = typeof sql === "string" ? (postgres(sql) as postgres.Sql<T>) : sql;
  const ownsClient = typeof sql === "string";

  return {
    dispose: async () => {
      if (ownsClient) {
        await client.end({ timeout: 0 });
      }
    },
    zql: new ZQLDatabase(new PostgresJsConnection(client), schema),
  };
}
