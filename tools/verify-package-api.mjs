import { spawn } from "node:child_process";

import { stopServer, waitForServer } from "./package-api-process.mjs";

const verifier = process.argv[2];
if (!verifier || !["api", "mutation-stress"].includes(verifier)) {
  throw new Error("Usage: node tools/verify-package-api.mjs <api|mutation-stress>");
}

const baseUrl = "http://127.0.0.1:4311";
const targets = "control,v3-drizzle,v3-pg,v3-postgresjs,v4-drizzle,v4-pg,v4-postgresjs";
const verifierFile =
  verifier === "api" ? "tools/verify-api-targets.mjs" : "tools/verify-mutation-stress.mjs";
const server = spawn(process.execPath, ["--import", "tsx", "examples/api/src/server.ts"], {
  detached: true,
  env: { ...process.env, HOST: "127.0.0.1", PORT: "4311" },
  stdio: "inherit",
});

try {
  await waitForServer(baseUrl, server);
  await run("pnpm", ["exec", "tsx", verifierFile, "--base-url", baseUrl, "--target", targets]);
} finally {
  await stopServer(server);
}

async function run(command, args) {
  const child = spawn(command, args, { env: process.env, stdio: "inherit" });
  const code = await new Promise((resolve, reject) => {
    const onError = (error) => {
      child.off("exit", onExit);
      reject(error);
    };
    const onExit = (exitCode) => {
      child.off("error", onError);
      resolve(exitCode);
    };
    child.once("error", onError);
    child.once("exit", onExit);
  });

  if (code !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited with code ${code}`);
  }
}
