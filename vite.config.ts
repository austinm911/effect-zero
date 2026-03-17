import { defineConfig } from "vite-plus";

export default defineConfig({
  lint: { options: { typeAware: true, typeCheck: true } },
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
