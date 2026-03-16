import { defineConfig } from "drizzle-kit";

export default defineConfig({
  ...(process.env.PG_URL ? { dbCredentials: { url: process.env.PG_URL } } : {}),
  dialect: "postgresql",
  out: "./drizzle",
  schema: "./src/db/schema.ts",
});
