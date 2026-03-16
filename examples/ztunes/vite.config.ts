import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import alchemy from "alchemy/cloudflare/tanstack-start";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  define: {
    __EFFECT_ZERO_API_BASE_URL__: JSON.stringify(
      process.env.EFFECT_ZERO_API_BASE_URL?.trim() || "http://effect-zero-api.localhost:1355",
    ),
    __EFFECT_ZERO_API_INTERNAL_URL__: JSON.stringify(
      process.env.EFFECT_ZERO_API_INTERNAL_URL?.trim() ||
        process.env.EFFECT_ZERO_API_BASE_URL?.trim() ||
        "http://effect-zero-api.localhost:1355",
    ),
  },
  plugins: [
    tsConfigPaths(),
    alchemy(),
    tanstackStart({
      srcDirectory: "app",
      importProtection: {
        client: {
          specifiers: ["postgres", "effect", "@effect-zero/v3", "@effect-zero/v4"],
        },
      },
    }),
    viteReact(),
  ],
});
