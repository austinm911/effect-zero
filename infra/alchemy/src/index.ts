export interface LocalPostgresConfig {
  readonly user: string;
  readonly password: string;
  readonly database: string;
  readonly port: number;
  readonly containerName: string;
  readonly volumeNamePrefix: string;
}

export const localPostgresDefaults: LocalPostgresConfig = {
  user: "postgres",
  password: "postgres",
  database: "effect_zero",
  port: 5438,
  containerName: "effect-zero-postgres",
  volumeNamePrefix: "effect-zero-postgres",
};
