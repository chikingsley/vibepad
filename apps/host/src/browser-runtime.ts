import {
  chmod,
  mkdir,
  readFile,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:net";
import { homedir, platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { type CommandRunner, runCommand } from "./service-discovery";

export const browserComposeProject = "vibepad-browser";
export const browserImage =
  "kasmweb/chrome@sha256:25389cc8eafa94981f7177bf2195f930bc1f761bedfe566b40f238154f33f965";
export const defaultBrowserCdpPort = 19_223;
export const defaultBrowserSurfacePort = 16_901;

export interface BrowserRuntimePaths {
  readonly agentBrowserConfig: string;
  readonly cacheDirectory: string;
  readonly composeEnvironment: string;
  readonly composeFile: string;
  readonly dataDirectory: string;
  readonly downloadDirectory: string;
  readonly entrypoint: string;
  readonly profileDirectory: string;
  readonly proxyConfig: string;
  readonly runtimeDirectory: string;
  readonly targetState: string;
}

export interface BrowserRuntimeConfiguration {
  readonly cdpPort: number;
  readonly image: string;
  readonly surfacePort: number;
}

export interface BrowserRuntimeStatus {
  readonly agentBrowserConfig: string;
  readonly cdpUrl: string;
  readonly composeProject: string;
  readonly containersActive: boolean;
  readonly healthy: boolean;
  readonly profileDirectory: string;
  readonly surfaceUrl: string;
}

interface BrowserTarget {
  readonly id: string;
  readonly type: string;
  readonly url: string;
}

interface BrowserTargetState {
  readonly urls: readonly string[];
  readonly version: 1;
}

type BrowserFetch = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

const { VIBEPAD_BROWSER_ASSETS_DIR: configuredBrowserAssets } = process.env;
const browserAssetsDirectory = configuredBrowserAssets
  ? resolve(configuredBrowserAssets)
  : fileURLToPath(new URL("../browser", import.meta.url));
const lineBreakPattern = /\r|\n/u;

const validPort = (value: number, label: string) => {
  if (!(Number.isInteger(value) && value > 0 && value <= 65_535)) {
    throw new Error(`Invalid ${label} port: ${value}`);
  }
  return value;
};

const requireSingleLine = (value: string, label: string) => {
  if (lineBreakPattern.test(value)) {
    throw new Error(`${label} must fit on one line`);
  }
  return value;
};

const envValue = (value: string) =>
  JSON.stringify(requireSingleLine(value, "Browser environment value"));

const isBrowserTarget = (value: unknown): value is BrowserTarget => {
  if (!(value && typeof value === "object")) {
    return false;
  }
  const candidate = value as Partial<BrowserTarget>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.type === "string" &&
    typeof candidate.url === "string"
  );
};

const isRestorableTargetUrl = (value: string) => {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
};

const parseTargetState = (value: string): BrowserTargetState | undefined => {
  try {
    const candidate = JSON.parse(value) as Partial<BrowserTargetState>;
    if (
      candidate.version === 1 &&
      Array.isArray(candidate.urls) &&
      candidate.urls.every(
        (url) => typeof url === "string" && isRestorableTargetUrl(url)
      )
    ) {
      return { urls: candidate.urls, version: 1 };
    }
  } catch {
    // Invalid or partial state is ignored so Chrome can start cleanly.
  }
};

const fileExists = async (path: string) => {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
};

const readIfPresent = async (path: string) => {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return "";
    }
    throw error;
  }
};

const writeAtomic = async (path: string, content: string, mode: number) => {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, content, { encoding: "utf8", mode });
  await chmod(temporaryPath, mode);
  await rename(temporaryPath, path);
};

const requireSuccess = async (
  runner: CommandRunner,
  executable: string,
  args: readonly string[]
) => {
  const result = await runner(executable, args);
  if (result.exitCode !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim();
    throw new Error(
      `${[executable, ...args].join(" ")} exited ${result.exitCode}${detail ? `: ${detail}` : ""}`
    );
  }
  return result;
};

const assertLoopbackPortAvailable = (port: number, label: string) =>
  new Promise<void>((resolveAvailable, rejectUnavailable) => {
    const server = createServer();
    server.unref();
    server.once("error", (error: NodeJS.ErrnoException) => {
      rejectUnavailable(
        error.code === "EADDRINUSE"
          ? new Error(
              `VibePad Browser ${label} port ${port} is already in use on 127.0.0.1`
            )
          : error
      );
    });
    server.listen({ host: "127.0.0.1", port }, () => {
      server.close((error) => {
        if (error) {
          rejectUnavailable(error);
          return;
        }
        resolveAvailable();
      });
    });
  });

export const browserRuntimePaths = (
  targetPlatform = platform(),
  homeDirectory = homedir()
): BrowserRuntimePaths => {
  const dataDirectory =
    targetPlatform === "darwin"
      ? join(
          homeDirectory,
          "Library",
          "Application Support",
          "VibePad",
          "browser"
        )
      : join(homeDirectory, ".local", "share", "vibepad", "browser");
  const runtimeDirectory = join(dataDirectory, "runtime");
  return {
    agentBrowserConfig: join(runtimeDirectory, "agent-browser.json"),
    cacheDirectory: join(dataDirectory, "cache", "default"),
    composeEnvironment: join(runtimeDirectory, "compose.env"),
    composeFile: join(browserAssetsDirectory, "compose.yaml"),
    dataDirectory,
    downloadDirectory: join(dataDirectory, "downloads", "default"),
    entrypoint: join(browserAssetsDirectory, "chrome-entrypoint.sh"),
    profileDirectory: join(dataDirectory, "profiles", "default"),
    proxyConfig: join(browserAssetsDirectory, "surface-proxy.conf"),
    runtimeDirectory,
    targetState: join(runtimeDirectory, "targets.json"),
  };
};

export const renderBrowserComposeEnvironment = (
  paths: BrowserRuntimePaths,
  configuration: BrowserRuntimeConfiguration
) =>
  [
    `VIBEPAD_BROWSER_CACHE_DIR=${envValue(paths.cacheDirectory)}`,
    `VIBEPAD_BROWSER_CDP_PORT=${configuration.cdpPort}`,
    `VIBEPAD_BROWSER_DOWNLOAD_DIR=${envValue(paths.downloadDirectory)}`,
    `VIBEPAD_BROWSER_ENTRYPOINT=${envValue(paths.entrypoint)}`,
    `VIBEPAD_BROWSER_IMAGE=${envValue(configuration.image)}`,
    `VIBEPAD_BROWSER_PROFILE_DIR=${envValue(paths.profileDirectory)}`,
    `VIBEPAD_BROWSER_PROXY_CONFIG=${envValue(paths.proxyConfig)}`,
    `VIBEPAD_BROWSER_SURFACE_PORT=${configuration.surfacePort}`,
    "",
  ].join("\n");

export const renderAgentBrowserConfig = (
  paths: BrowserRuntimePaths,
  configuration: BrowserRuntimeConfiguration
) =>
  `${JSON.stringify(
    {
      $schema: "https://agent-browser.dev/schema.json",
      cdp: `http://127.0.0.1:${configuration.cdpPort}`,
      contentBoundaries: true,
      downloadPath: paths.downloadDirectory,
      maxOutput: 30_000,
      namespace: "vibepad",
      screenshotDir: join(paths.runtimeDirectory, "screenshots"),
      session: "vibepad-live",
    },
    null,
    2
  )}\n`;

export class VibePadBrowserRuntime {
  readonly #configuration: BrowserRuntimeConfiguration;
  readonly #fetch: BrowserFetch;
  readonly #paths: BrowserRuntimePaths;
  readonly #runner: CommandRunner;

  constructor(
    options: {
      readonly cdpPort?: number;
      readonly fetcher?: BrowserFetch;
      readonly homeDirectory?: string;
      readonly image?: string;
      readonly paths?: BrowserRuntimePaths;
      readonly platform?: NodeJS.Platform;
      readonly runner?: CommandRunner;
      readonly surfacePort?: number;
    } = {}
  ) {
    this.#configuration = {
      cdpPort: validPort(
        options.cdpPort ?? defaultBrowserCdpPort,
        "browser CDP"
      ),
      image: requireSingleLine(options.image ?? browserImage, "Browser image"),
      surfacePort: validPort(
        options.surfacePort ?? defaultBrowserSurfacePort,
        "browser surface"
      ),
    };
    if (this.#configuration.cdpPort === this.#configuration.surfacePort) {
      throw new Error("Browser CDP and surface ports must be different");
    }
    this.#paths =
      options.paths ??
      browserRuntimePaths(
        options.platform ?? platform(),
        options.homeDirectory ?? homedir()
      );
    this.#fetch = options.fetcher ?? fetch;
    this.#runner = options.runner ?? runCommand;
  }

  get agentBrowserConfig() {
    return this.#paths.agentBrowserConfig;
  }

  get cdpUrl() {
    return `http://127.0.0.1:${this.#configuration.cdpPort}`;
  }

  get profileDirectory() {
    return this.#paths.profileDirectory;
  }

  get surfaceUrl() {
    return `http://127.0.0.1:${this.#configuration.surfacePort}`;
  }

  async install(options: { readonly start?: boolean } = {}) {
    await this.#assertDependencies();
    await Promise.all(
      [
        this.#paths.cacheDirectory,
        this.#paths.downloadDirectory,
        this.#paths.profileDirectory,
        this.#paths.runtimeDirectory,
        join(this.#paths.runtimeDirectory, "screenshots"),
      ].map(async (path) => {
        await mkdir(path, { mode: 0o700, recursive: true });
        await chmod(path, 0o700);
      })
    );
    await Promise.all([
      writeAtomic(
        this.#paths.composeEnvironment,
        renderBrowserComposeEnvironment(this.#paths, this.#configuration),
        0o600
      ),
      writeAtomic(
        this.#paths.agentBrowserConfig,
        renderAgentBrowserConfig(this.#paths, this.#configuration),
        0o600
      ),
    ]);
    if (options.start ?? true) {
      if ((await this.#runningContainerCount()) === 0) {
        await Promise.all([
          assertLoopbackPortAvailable(this.#configuration.cdpPort, "CDP"),
          assertLoopbackPortAvailable(
            this.#configuration.surfacePort,
            "surface"
          ),
        ]);
      }
      await this.start();
    }
    return this.status();
  }

  async start() {
    await this.#requireInstalled();
    await requireSuccess(this.#runner, "docker", [
      "compose",
      ...this.#composeArgs(),
      "up",
      "--detach",
      "--wait",
      "chrome",
      "cdp-bridge",
      "surface-proxy",
    ]);
    const status = await this.status();
    if (!status.healthy) {
      throw new Error(
        `VibePad Browser containers started without healthy CDP and KasmVNC endpoints; inspect docker compose --project-name ${browserComposeProject} logs`
      );
    }
    await this.#restoreTargets();
  }

  async stop() {
    await this.#requireInstalled();
    await this.#snapshotTargets();
    await this.#runner("docker", [
      "compose",
      ...this.#composeArgs(),
      "exec",
      "--no-TTY",
      "chrome",
      "sh",
      "-lc",
      'pid="$(pgrep -o -x chrome 2>/dev/null || true)"; if [ -n "$pid" ]; then kill -TERM "$pid"; i=0; while kill -0 "$pid" 2>/dev/null && [ "$i" -lt 50 ]; do sleep 0.1; i=$((i + 1)); done; fi',
    ]);
    await requireSuccess(this.#runner, "docker", [
      "compose",
      ...this.#composeArgs(),
      "down",
    ]);
  }

  async status(): Promise<BrowserRuntimeStatus> {
    const compose = await this.#runner("docker", [
      "compose",
      ...this.#composeArgs(),
      "ps",
      "--status",
      "running",
      "--quiet",
    ]);
    const containersActive =
      compose.exitCode === 0 && this.#countLines(compose.stdout) === 3;
    const [cdpHealthy, surfaceHealthy] = await Promise.all([
      this.#reachable(`${this.cdpUrl}/json/version`),
      this.#reachable(`${this.surfaceUrl}/vnc.html`),
    ]);
    return {
      agentBrowserConfig: this.#paths.agentBrowserConfig,
      cdpUrl: this.cdpUrl,
      composeProject: browserComposeProject,
      containersActive,
      healthy: containersActive && cdpHealthy && surfaceHealthy,
      profileDirectory: this.#paths.profileDirectory,
      surfaceUrl: this.surfaceUrl,
    };
  }

  #composeArgs() {
    return [
      "--project-name",
      browserComposeProject,
      "--env-file",
      this.#paths.composeEnvironment,
      "--file",
      this.#paths.composeFile,
    ];
  }

  #countLines(value: string) {
    return value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean).length;
  }

  async #runningContainerCount() {
    const result = await this.#runner("docker", [
      "compose",
      ...this.#composeArgs(),
      "ps",
      "--status",
      "running",
      "--quiet",
    ]);
    return result.exitCode === 0 ? this.#countLines(result.stdout) : 0;
  }

  async #browserTargets() {
    const response = await this.#fetch(`${this.cdpUrl}/json/list`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) {
      throw new Error(`VibePad Browser CDP returned ${response.status}`);
    }
    const value = (await response.json()) as unknown;
    return Array.isArray(value) ? value.filter(isBrowserTarget) : [];
  }

  async #restoreTargets() {
    const saved = parseTargetState(
      await readIfPresent(this.#paths.targetState)
    );
    if (!saved || saved.urls.length === 0) {
      return;
    }
    const current = await this.#browserTargets();
    const currentUrls = new Set(current.map((target) => target.url));
    const urlsToRestore = saved.urls.filter((url) => !currentUrls.has(url));
    await Promise.all(
      urlsToRestore.map(async (url) => {
        const response = await this.#fetch(
          `${this.cdpUrl}/json/new?${encodeURIComponent(url)}`,
          { method: "PUT", signal: AbortSignal.timeout(5000) }
        );
        if (!response.ok) {
          throw new Error(`VibePad Browser could not restore ${url}`);
        }
      })
    );
    await Promise.all(
      current
        .filter(
          (target) =>
            target.type === "page" && target.url === "chrome://newtab/"
        )
        .map((target) =>
          this.#fetch(`${this.cdpUrl}/json/close/${target.id}`, {
            signal: AbortSignal.timeout(2000),
          })
        )
    );
  }

  async #snapshotTargets() {
    try {
      const targets = await this.#browserTargets();
      const urls = [
        ...new Set(
          targets
            .filter((target) => target.type === "page")
            .map((target) => target.url)
            .filter(isRestorableTargetUrl)
        ),
      ];
      await writeAtomic(
        this.#paths.targetState,
        `${JSON.stringify({ urls, version: 1 } satisfies BrowserTargetState, null, 2)}\n`,
        0o600
      );
    } catch {
      // A stopped or unhealthy browser must remain stoppable; preserve the last
      // successful target snapshot instead of replacing it with partial state.
    }
  }

  async #assertDependencies() {
    await requireSuccess(this.#runner, "docker", [
      "version",
      "--format",
      "{{.Server.Version}}",
    ]).catch(() => {
      throw new Error(
        "VibePad Browser requires a running Docker engine; install Docker Desktop on macOS or Docker Engine on Linux"
      );
    });
    await requireSuccess(this.#runner, "docker", ["compose", "version"]).catch(
      () => {
        throw new Error("VibePad Browser requires the Docker Compose plugin");
      }
    );
    if (!(await fileExists(this.#paths.composeFile))) {
      throw new Error(
        `VibePad browser compose file is missing: ${this.#paths.composeFile}`
      );
    }
    if (!(await fileExists(this.#paths.entrypoint))) {
      throw new Error(
        `VibePad browser entrypoint is missing: ${this.#paths.entrypoint}`
      );
    }
    if (!(await fileExists(this.#paths.proxyConfig))) {
      throw new Error(
        `VibePad browser proxy config is missing: ${this.#paths.proxyConfig}`
      );
    }
  }

  async #reachable(url: string) {
    try {
      const response = await this.#fetch(url, {
        signal: AbortSignal.timeout(2000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async #requireInstalled() {
    if (!(await fileExists(this.#paths.composeEnvironment))) {
      throw new Error("Install VibePad Browser before managing its containers");
    }
  }
}
