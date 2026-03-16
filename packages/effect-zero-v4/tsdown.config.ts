import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    client: "src/client.ts",
    index: "src/index.ts",
    server: "src/server.ts",
    "server/adapters/drizzle": "src/server/adapters/drizzle.ts",
    "server/adapters/pg": "src/server/adapters/pg.ts",
    "server/adapters/postgresjs": "src/server/adapters/postgresjs.ts",
  },
  dts: {
    tsgo: true,
  },
});
