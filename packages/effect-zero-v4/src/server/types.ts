import type { PgClientConfig } from "@effect-zero/sql-pg-v4/PgClient";
import type { Schema as ZeroSchema } from "@rocicorp/zero";
import type { ZQLDatabase } from "@rocicorp/zero/server";

export type EffectPgConfig = Omit<PgClientConfig, "url">;

export interface EffectZeroProvider<TZeroSchema extends ZeroSchema, TWrappedTransaction> {
  readonly zql: ZQLDatabase<TZeroSchema, TWrappedTransaction>;
  dispose(): Promise<void>;
}
