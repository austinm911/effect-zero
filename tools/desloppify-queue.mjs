import { spawnSync } from "node:child_process";

const result = spawnSync("desloppify", ["next"], {
  stdio: "inherit",
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
