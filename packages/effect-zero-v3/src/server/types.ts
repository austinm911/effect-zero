import type { PgClientConfig } from "@effect/sql-pg/PgClient";
import type { Schema as ZeroSchema } from "@rocicorp/zero";
import type { ZQLDatabase } from "@rocicorp/zero/server";

export type EffectPgConfig = Omit<PgClientConfig, "url">;

export interface EffectZeroProvider<TZeroSchema extends ZeroSchema, TWrappedTransaction> {
  readonly zql: ZQLDatabase<TZeroSchema, TWrappedTransaction>;
  dispose(): Promise<void>;
}
