import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    dts: {
      tsgo: true,
    },
    entry: {
      client: "src/client.ts",
      index: "src/index.ts",
      server: "src/server.ts",
      "server/adapters/drizzle": "src/server/adapters/drizzle.ts",
      "server/adapters/pg": "src/server/adapters/pg.ts",
      "server/adapters/postgresjs": "src/server/adapters/postgresjs.ts",
    },
  },
});
