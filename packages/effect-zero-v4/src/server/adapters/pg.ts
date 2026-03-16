import type { Schema as ZeroSchema } from "@rocicorp/zero";
import {
  type DBConnection,
  type DBTransaction,
  type Row,
  executePostgresQuery,
  ZQLDatabase,
} from "@rocicorp/zero/server";
import type { Client, PoolClient } from "pg";
import { Pool } from "pg";
import type { EffectZeroProvider } from "../types.js";

export type NodePgTransaction = PoolClient | Client;

type NodePgInput = Pool | NodePgTransaction;

class NodePgConnection implements DBConnection<NodePgTransaction> {
  readonly #client: NodePgInput;

  constructor(client: NodePgInput) {
    this.#client = client;
  }

  async transaction<TReturn>(
    callback: (tx: DBTransaction<NodePgTransaction>) => Promise<TReturn>,
  ): Promise<TReturn> {
    const transactionalClient =
      this.#client instanceof Pool ? await this.#client.connect() : this.#client;

    try {
      await transactionalClient.query("BEGIN");
      const result = await callback(new NodePgTransactionInternal(transactionalClient));
      await transactionalClient.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await transactionalClient.query("ROLLBACK");
      } catch {}

      throw error;
    } finally {
      if (this.#client instanceof Pool && "release" in transactionalClient) {
        transactionalClient.release();
      }
    }
  }
}

class NodePgTransactionInternal implements DBTransaction<NodePgTransaction> {
  readonly wrappedTransaction: NodePgTransaction;

  constructor(client: NodePgTransaction) {
    this.wrappedTransaction = client;
  }

  readonly query: DBTransaction<NodePgTransaction>["query"] = async (sql, params) => {
    const result = await this.wrappedTransaction.query(sql, params);
    return result.rows as Row[];
  };

  readonly runQuery: DBTransaction<NodePgTransaction>["runQuery"] = (
    ast,
    format,
    schema,
    serverSchema,
  ) => {
    return executePostgresQuery(this, ast, format, schema, serverSchema);
  };
}

export function zeroEffectNodePg<TZeroSchema extends ZeroSchema>(
  schema: TZeroSchema,
  pool: Pool | NodePgTransaction | string,
): EffectZeroProvider<TZeroSchema, NodePgTransaction> {
  let client: NodePgInput;
  let ownedPool: Pool | undefined;

  if (typeof pool === "string") {
    ownedPool = new Pool({ connectionString: pool });
    client = ownedPool;
  } else {
    client = pool;
  }

  return {
    dispose: async () => {
      if (ownedPool) {
        await ownedPool.end();
      }
    },
    zql: new ZQLDatabase(new NodePgConnection(client), schema),
  };
}
