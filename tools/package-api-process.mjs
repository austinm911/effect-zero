export async function waitForServer(
  baseUrl,
  server,
  { attempts = 60, intervalMs = 250, requestTimeoutMs = 1_000 } = {},
) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (server.exitCode !== null) {
      throw new Error(`API server exited with code ${server.exitCode}`);
    }
    try {
      await fetch(baseUrl, { signal: AbortSignal.timeout(requestTimeoutMs) });
      return;
    } catch {
      if (attempt + 1 < attempts) {
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    }
  }
  throw new Error(`Timed out waiting for ${baseUrl}`);
}

export async function stopServer(server) {
  if (!server.pid || server.exitCode !== null) return;
  try {
    process.kill(-server.pid, "SIGTERM");
  } catch (error) {
    if (error?.code === "ESRCH") return;
    throw error;
  }
  if (await waitForExit(server, 5_000)) return;
  try {
    process.kill(-server.pid, "SIGKILL");
  } catch (error) {
    if (error?.code === "ESRCH") return;
    throw error;
  }
  if (!(await waitForExit(server, 1_000))) {
    throw new Error(`API server process group ${server.pid} did not stop`);
  }
}

function waitForExit(server, timeoutMs) {
  if (server.exitCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const onExit = () => {
      clearTimeout(timeout);
      server.off("exit", onExit);
      resolve(true);
    };
    const timeout = setTimeout(() => {
      server.off("exit", onExit);
      resolve(server.exitCode !== null);
    }, timeoutMs);
    server.once("exit", onExit);
    if (server.exitCode !== null) onExit();
  });
}
