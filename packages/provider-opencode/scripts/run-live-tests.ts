import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "bun";

const host = "127.0.0.1";
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const packageDirectory = resolve(scriptDirectory, "..");
const repositoryDirectory = resolve(scriptDirectory, "../../..");
const environment = process.env as Readonly<{
  VIBEPAD_LIVE_PROJECT_DIR?: string;
  VIBEPAD_OPENCODE_BIN?: string;
}>;

const reservePort = async () => {
  const reservation = createServer();
  await new Promise<void>((resolveListen, rejectListen) => {
    reservation.once("error", rejectListen);
    reservation.listen(0, host, resolveListen);
  });
  const address = reservation.address();
  if (!address || typeof address === "string") {
    reservation.close();
    throw new Error("Unable to reserve an OpenCode live-test port");
  }
  await new Promise<void>((resolveClose, rejectClose) => {
    reservation.close((error) => {
      if (error) {
        rejectClose(error);
        return;
      }
      resolveClose();
    });
  });
  return address.port;
};

const waitForHealth = async (serverUrl: string, authorization?: string) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: The real server is polled until it is ready.
      const response = await fetch(`${serverUrl}/global/health`, {
        ...(authorization ? { headers: { Authorization: authorization } } : {}),
        signal: AbortSignal.timeout(500),
      });
      if (response.ok) {
        return (await response.json()) as unknown;
      }
    } catch {
      // The real server is still starting.
    }
    await new Promise<void>((resolveDelay) => {
      setTimeout(resolveDelay, 50);
    });
  }
  throw new Error(
    `OpenCode live-test server did not become healthy: ${serverUrl}`
  );
};

const executable = environment.VIBEPAD_OPENCODE_BIN ?? "opencode";

interface OpenCodeTestServer {
  readonly baseUrl: string;
  readonly configDirectory: string;
  readonly process: ReturnType<typeof spawn>;
}

const startServer = async ({
  password,
  username,
}: {
  readonly password?: string;
  readonly username?: string;
} = {}): Promise<OpenCodeTestServer> => {
  const configDirectory = await mkdtemp(
    join(tmpdir(), "vibepad-opencode-live-")
  );
  const port = await reservePort();
  const baseUrl = `http://${host}:${port}`;
  const authorization = password
    ? `Basic ${btoa(`${username ?? "opencode"}:${password}`)}`
    : undefined;
  const server = spawn(
    [
      executable,
      "serve",
      "--pure",
      "--hostname",
      host,
      "--port",
      String(port),
      "--print-logs",
      "--log-level",
      "WARN",
    ],
    {
      cwd: repositoryDirectory,
      env: {
        ...process.env,
        OPENCODE_CONFIG: undefined,
        OPENCODE_CONFIG_CONTENT: "{}",
        OPENCODE_PERMISSION: undefined,
        OPENCODE_SERVER_PASSWORD: password,
        OPENCODE_SERVER_USERNAME: username,
        XDG_CACHE_HOME: join(configDirectory, "cache"),
        XDG_CONFIG_HOME: join(configDirectory, "config"),
        XDG_DATA_HOME: join(configDirectory, "data"),
        XDG_STATE_HOME: join(configDirectory, "state"),
      },
      stderr: "inherit",
      stdout: "inherit",
    }
  );

  try {
    const startup = await Promise.race([
      waitForHealth(baseUrl, authorization).then((health) => ({
        health,
        state: "healthy" as const,
      })),
      server.exited.then((code) => ({ code, state: "exited" as const })),
    ]);
    if (startup.state === "exited") {
      throw new Error(
        `OpenCode live-test server exited during startup: ${startup.code}`
      );
    }
    console.log(`OpenCode live-test server ${JSON.stringify(startup.health)}`);
    return { baseUrl, configDirectory, process: server };
  } catch (error) {
    if (server.exitCode === null) {
      server.kill("SIGKILL");
      await server.exited;
    }
    await rm(configDirectory, { force: true, recursive: true });
    throw error;
  }
};

const stopServer = async (server: OpenCodeTestServer) => {
  if (server.process.exitCode === null) {
    server.process.kill("SIGTERM");
  }
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const closed = await Promise.race([
    server.process.exited.then(() => true),
    new Promise<false>((resolveTimeout) => {
      timeout = setTimeout(() => resolveTimeout(false), 3000);
    }),
  ]);
  if (timeout) {
    clearTimeout(timeout);
  }
  if (!closed && server.process.exitCode === null) {
    server.process.kill("SIGKILL");
    await server.process.exited;
  }
  await rm(server.configDirectory, { force: true, recursive: true });
};

let exitCode = 1;
let primaryServer: OpenCodeTestServer | undefined;
let authenticatedServer: OpenCodeTestServer | undefined;
try {
  primaryServer = await startServer();
  const authUsername = "vibepad-e2e";
  const authPassword = `vibepad-e2e-${crypto.randomUUID()}`;
  authenticatedServer = await startServer({
    password: authPassword,
    username: authUsername,
  });

  const vitest = spawn(
    [
      resolve(repositoryDirectory, "node_modules/.bin/vitest"),
      "run",
      "--reporter=verbose",
      "src/adapter.integration.test.ts",
    ],
    {
      cwd: packageDirectory,
      env: {
        ...process.env,
        VIBEPAD_LIVE_OPENCODE_AUTH_PASSWORD: authPassword,
        VIBEPAD_LIVE_OPENCODE_AUTH_URL: authenticatedServer.baseUrl,
        VIBEPAD_LIVE_OPENCODE_AUTH_USERNAME: authUsername,
        VIBEPAD_LIVE_OPENCODE_INTERACTION_URL: primaryServer.baseUrl,
        VIBEPAD_LIVE_OPENCODE_TESTS: "1",
        VIBEPAD_LIVE_PROJECT_DIR:
          environment.VIBEPAD_LIVE_PROJECT_DIR ?? repositoryDirectory,
        VIBEPAD_OPENCODE_URL: primaryServer.baseUrl,
      },
      stderr: "inherit",
      stdout: "inherit",
    }
  );
  exitCode = await vitest.exited;
} finally {
  if (authenticatedServer) {
    await stopServer(authenticatedServer);
  }
  if (primaryServer) {
    await stopServer(primaryServer);
  }
}

process.exitCode = exitCode;
