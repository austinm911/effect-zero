import alchemy, { type Scope } from "alchemy";
import * as docker from "alchemy/docker";
import { FileSystemStateStore } from "alchemy/state";
import { localPostgresDefaults } from "./src/index.ts";

const stateStore = (scope: Scope) => new FileSystemStateStore(scope);

const app = await alchemy("alchemy", {
  stateStore,
});

const stage = app.stage;
const isLocalStage = stage !== "prod";

const postgresConfig = {
  user: process.env.EFFECT_ZERO_PG_USER?.trim() || localPostgresDefaults.user,
  password: process.env.EFFECT_ZERO_PG_PASSWORD?.trim() || localPostgresDefaults.password,
  database: process.env.EFFECT_ZERO_PG_DATABASE?.trim() || localPostgresDefaults.database,
  port: Number.parseInt(
    process.env.EFFECT_ZERO_PG_PORT?.trim() || String(localPostgresDefaults.port),
    10,
  ),
  containerName:
    process.env.EFFECT_ZERO_PG_CONTAINER?.trim() || localPostgresDefaults.containerName,
  volumeNamePrefix: localPostgresDefaults.volumeNamePrefix,
} as const;

const postgresUrl =
  `postgres://${postgresConfig.user}:${postgresConfig.password}@localhost:${postgresConfig.port}/${postgresConfig.database}` as const;

if (isLocalStage) {
  const postgresVolume = await docker.Volume("pg-volume", {
    adopt: true,
    name: `${postgresConfig.volumeNamePrefix}-${stage}`,
  });

  const postgres = await docker.Container("postgres", {
    adopt: true,
    image: "postgres:18-alpine",
    name: postgresConfig.containerName,
    ports: [{ external: String(postgresConfig.port), internal: 5432 }],
    volumes: [
      {
        hostPath: postgresVolume.name,
        containerPath: "/var/lib/postgresql/data",
      },
    ],
    environment: {
      POSTGRES_DB: postgresConfig.database,
      POSTGRES_PASSWORD: postgresConfig.password,
      POSTGRES_USER: postgresConfig.user,
    },
    command: [
      "postgres",
      "-c",
      "wal_level=logical",
      "-c",
      "max_wal_senders=10",
      "-c",
      "max_replication_slots=10",
    ],
    healthcheck: {
      cmd: ["pg_isready", "-U", postgresConfig.user, "-d", postgresConfig.database],
      interval: "10s",
      timeout: "5s",
      retries: 5,
    },
    restart: "always",
    start: true,
  });

  console.log("[alchemy] postgres container", {
    id: postgres.id,
    name: postgres.name,
    postgresUrl,
    state: postgres.state,
  });
}

export const localPostgres = {
  port: postgresConfig.port,
  url: postgresUrl,
  user: postgresConfig.user,
  database: postgresConfig.database,
};

export const backendBindings = {
  APP_STAGE: stage,
  PG_DATABASE: postgresConfig.database,
  PG_PORT: String(postgresConfig.port),
  PG_URL: postgresUrl,
};

await app.finalize();
