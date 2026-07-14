import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    dts: {
      tsgo: true,
    },
    entry: {
      client: "src/client.ts",
      index: "src/index.ts",
      openapi: "src/openapi.ts",
      "openapi/elysia": "src/openapi/elysia.ts",
      "openapi/hono": "src/openapi/hono.ts",
      "openapi/zod": "src/openapi/zod.ts",
      server: "src/server.ts",
      timestamps: "src/timestamps.ts",
      "server/adapters/drizzle": "src/server/adapters/drizzle.ts",
      "server/adapters/pg": "src/server/adapters/pg.ts",
      "server/adapters/postgresjs": "src/server/adapters/postgresjs.ts",
    },
  },
});
