import { Buffer } from "node:buffer";
import { type ChildProcess, spawn } from "node:child_process";

const healthPath = "/global/health";
const startupAttempts = 100;
const startupDelayMs = 100;
const shutdownTimeoutMs = 3000;

export interface ManagedOpenCodeRuntimeOptions {
  readonly baseUrl: string;
  readonly cwd: string;
  readonly executable: string;
  readonly password?: string;
  readonly username: string;
}

export type OpenCodeRuntimeState = "adopted" | "started";

const delay = (durationMs: number) =>
  new Promise<void>((resolveDelay) => {
    setTimeout(resolveDelay, durationMs);
  });

const basicAuthorization = (username: string, password: string | undefined) =>
  password
    ? `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`
    : undefined;

const healthUrlFor = (baseUrl: string) => {
  const url = new URL(baseUrl);
  url.pathname = healthPath;
  url.search = "";
  url.hash = "";
  return url.toString();
};

const isHealthy = async (url: string, authorization: string | undefined) => {
  try {
    const response = await fetch(url, {
      ...(authorization ? { headers: { Authorization: authorization } } : {}),
      signal: AbortSignal.timeout(750),
    });
    return response.ok;
  } catch {
    return false;
  }
};

const waitForExit = (child: ChildProcess) =>
  new Promise<number>((resolveExit) => {
    child.once("exit", (code) => resolveExit(code ?? 1));
  });

export class ManagedOpenCodeRuntime {
  readonly #authorization: string | undefined;
  readonly #baseUrl: URL;
  #child: ChildProcess | undefined;
  readonly #cwd: string;
  readonly #executable: string;
  readonly #healthUrl: string;
  readonly #password: string | undefined;
  readonly #username: string;

  constructor(options: ManagedOpenCodeRuntimeOptions) {
    this.#baseUrl = new URL(options.baseUrl);
    if (
      this.#baseUrl.protocol !== "http:" ||
      !["127.0.0.1", "localhost", "::1"].includes(this.#baseUrl.hostname) ||
      (this.#baseUrl.pathname !== "/" && this.#baseUrl.pathname !== "")
    ) {
      throw new Error(
        "Managed OpenCode requires a loopback HTTP base URL without a path"
      );
    }
    this.#authorization = basicAuthorization(
      options.username,
      options.password
    );
    this.#cwd = options.cwd;
    this.#executable = options.executable;
    this.#healthUrl = healthUrlFor(options.baseUrl);
    this.#password = options.password;
    this.#username = options.username;
  }

  async start(): Promise<OpenCodeRuntimeState> {
    if (await isHealthy(this.#healthUrl, this.#authorization)) {
      return "adopted";
    }
    const port = this.#baseUrl.port || "80";
    const child = spawn(
      this.#executable,
      [
        "serve",
        "--hostname",
        this.#baseUrl.hostname,
        "--port",
        port,
        "--print-logs",
        "--log-level",
        "WARN",
      ],
      {
        cwd: this.#cwd,
        env: {
          ...process.env,
          ...(this.#password
            ? { OPENCODE_SERVER_PASSWORD: this.#password }
            : {}),
          OPENCODE_SERVER_USERNAME: this.#username,
        },
        stdio: ["ignore", "inherit", "inherit"],
      }
    );
    this.#child = child;
    const exited = waitForExit(child);
    for (let attempt = 0; attempt < startupAttempts; attempt += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: Readiness polling is intentionally sequential.
      if (await isHealthy(this.#healthUrl, this.#authorization)) {
        return "started";
      }
      if (child.exitCode !== null) {
        throw new Error(
          `Managed OpenCode exited during startup with code ${await exited}`
        );
      }
      await delay(startupDelayMs);
    }
    child.kill("SIGTERM");
    await exited;
    throw new Error(
      `Managed OpenCode did not become healthy at ${this.#healthUrl}`
    );
  }

  async dispose(): Promise<void> {
    const child = this.#child;
    this.#child = undefined;
    if (!child || child.exitCode !== null) {
      return;
    }
    child.kill("SIGTERM");
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const exited = await Promise.race([
      waitForExit(child).then(() => true),
      new Promise<false>((resolveTimeout) => {
        timeout = setTimeout(() => resolveTimeout(false), shutdownTimeoutMs);
      }),
    ]);
    if (timeout) {
      clearTimeout(timeout);
    }
    if (!exited && child.exitCode === null) {
      child.kill("SIGKILL");
      await waitForExit(child);
    }
  }
}
