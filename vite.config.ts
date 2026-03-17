import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {
    ignorePatterns: ["examples/ztunes/app/routeTree.gen.ts"],
  },
  lint: {
    ignorePatterns: [".context/**"],
  },
  test: {
    include: ["packages/**/__tests__/**/*.test.ts", "packages/**/__tests__/**/*.test.tsx"],
    exclude: [".context/**", "**/.context/**"],
  },
  staged: {
    "*.{js,jsx,mjs,cjs,ts,tsx,json,md,yml,yaml}": "vp fmt --write",
  },
  run: {
    tasks: {
      "stack:dev": {
        cache: false,
        command: "bash scripts/dev-stack.sh",
      },
      "stack:api": {
        cache: false,
        command: "pnpm --filter @effect-zero/example-api dev",
      },
      "stack:web": {
        cache: false,
        command: "pnpm --filter @effect-zero/example-ztunes dev",
      },
      "stack:zero": {
        cache: false,
        command: "scripts/zero-cache-dev.sh",
      },
    },
  },
});
