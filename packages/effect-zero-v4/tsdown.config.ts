import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    client: "src/client.ts",
    index: "src/index.ts",
    openapi: "src/openapi.ts",
    "openapi/elysia": "src/openapi/elysia.ts",
    "openapi/hono": "src/openapi/hono.ts",
    "openapi/zod": "src/openapi/zod.ts",
    server: "src/server.ts",
    "server/adapters/drizzle": "src/server/adapters/drizzle.ts",
    "server/adapters/pg": "src/server/adapters/pg.ts",
    "server/adapters/postgresjs": "src/server/adapters/postgresjs.ts",
  },
  dts: {
    tsgo: true,
  },
});
