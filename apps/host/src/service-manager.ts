import { randomBytes } from "node:crypto";
import {
  chmod,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { homedir, platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import { HostAuthService, type PairingCode } from "./host-auth";
import {
  assertSafeBindAddress,
  type CommandRunner,
  discoverHostTools,
  discoverTailscaleIdentity,
  type HostNetworkIdentity,
  type HostToolInventory,
  runCommand,
} from "./service-discovery";
import {
  type HostServiceConfiguration,
  hostServicePaths,
  readHostEnvironmentValue,
  renderHostEnvironment,
  renderHostRunner,
  renderLaunchAgent,
  renderSystemdUnit,
  serviceDefinitionDirectory,
  serviceLabel,
  systemdUnitName,
} from "./service-files";

const defaultPort = 4100;
const repoRoot = resolve(import.meta.dir, "../../..");
const serviceHostNamePattern = /^[A-Za-z0-9._-]+$/u;

export interface InstallHostServiceOptions {
  readonly agentBrowserConfig?: string;
  readonly agentBrowserExecutable?: string;
  readonly allowPublicBind?: boolean;
  readonly bindAddress?: string;
  readonly browserCdpUrl?: string;
  readonly browserEnabled?: boolean;
  readonly browserSurfaceUrl?: string;
  readonly codexEnabled?: boolean;
  readonly codexExecutable?: string;
  readonly hostName?: string;
  readonly openCodeBaseUrl?: string;
  readonly openCodeEnabled?: boolean;
  readonly openCodeExecutable?: string;
  readonly openCodeManaged?: boolean;
  readonly openCodePassword?: string;
  readonly openCodeUsername?: string;
  readonly port?: number;
  readonly projectRoots?: readonly string[];
  readonly skipDependencies?: boolean;
  readonly start?: boolean;
}

export interface HostServiceInspection {
  readonly healthUrl: string;
  readonly identity: HostNetworkIdentity;
  readonly installed: boolean;
  readonly platform: NodeJS.Platform;
  readonly serviceDefinition: string;
  readonly tools: HostToolInventory;
}

export interface HostServiceInstallResult extends HostServiceInspection {
  readonly clientUrl: string;
  readonly healthy: boolean;
  readonly started: boolean;
}

export interface HostServiceStatus {
  readonly active: boolean;
  readonly detail: string;
  readonly healthUrl: string;
  readonly healthy: boolean;
}

export interface HostPairingCode extends PairingCode {
  readonly clientUrl: string;
  readonly hostId: string;
  readonly hostName: string;
}

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

const pathForService = (
  tools: HostToolInventory,
  homeDirectory: string,
  explicitExecutables: readonly (string | undefined)[] = []
) => {
  const entries = [
    ...explicitExecutables.map((executable) =>
      executable ? dirname(executable) : undefined
    ),
    dirname(tools.bun),
    tools.agentBrowser ? dirname(tools.agentBrowser) : undefined,
    tools.codex ? dirname(tools.codex) : undefined,
    tools.opencode ? dirname(tools.opencode) : undefined,
    dirname(tools.tailscale),
    `${homeDirectory}/.local/bin`,
    `${homeDirectory}/.bun/bin`,
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
  ];
  return [
    ...new Set(entries.filter((entry): entry is string => Boolean(entry))),
  ].join(":");
};

const fileExists = async (path: string) => {
  try {
    await readFile(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
};

const healthCheck = async (url: string) => {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return response.ok;
  } catch {
    return false;
  }
};

const delay = (durationMs: number) =>
  new Promise<void>((resolveDelay) => {
    setTimeout(resolveDelay, durationMs);
  });

const waitForHealth = async (url: string, attemptsRemaining = 60) => {
  if (await healthCheck(url)) {
    return true;
  }
  if (attemptsRemaining <= 1) {
    return false;
  }
  await delay(500);
  return waitForHealth(url, attemptsRemaining - 1);
};

const resolvePort = (port = defaultPort) => {
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Invalid VibePad Host port: ${port}`);
  }
  return port;
};

const resolveHostName = (
  requested: string | undefined,
  identity: HostNetworkIdentity
) => {
  const hostName = requested?.trim() || identity.hostName;
  if (!serviceHostNamePattern.test(hostName)) {
    throw new Error(`Invalid VibePad Host name: ${hostName}`);
  }
  return hostName;
};

const resolveProjectRoots = (
  requested: readonly string[] | undefined,
  homeDirectory: string
) => {
  const projectRoots = (requested?.length ? requested : [homeDirectory]).map(
    (path) => resolve(path)
  );
  if (projectRoots.some((path) => path.includes(","))) {
    throw new Error("VibePad Codex project roots cannot contain commas");
  }
  return projectRoots;
};

interface ResolvedHarnessConfiguration {
  readonly codexEnabled: boolean;
  readonly codexExecutable?: string;
  readonly openCodeBaseUrl: string;
  readonly openCodeEnabled: boolean;
  readonly openCodeExecutable?: string;
  readonly openCodeManaged: boolean;
  readonly openCodePassword?: string;
  readonly openCodeUsername: string;
}

const assertHarnessExecutables = (
  codexEnabled: boolean,
  codexExecutable: string | undefined,
  openCodeEnabled: boolean,
  openCodeExecutable: string | undefined
) => {
  if (!(codexEnabled || openCodeEnabled)) {
    throw new Error(
      "VibePad Host requires at least one enabled Codex or OpenCode harness"
    );
  }
  if (codexEnabled && !codexExecutable) {
    throw new Error("Codex is enabled, but no Codex executable was found");
  }
  if (openCodeEnabled && !openCodeExecutable) {
    throw new Error(
      "OpenCode is enabled, but no OpenCode executable was found"
    );
  }
};

const resolveOpenCodePassword = (
  requested: string | undefined,
  existing: string | undefined,
  managed: boolean
) => {
  const configured = requested ?? existing;
  if (configured || !managed) {
    return configured;
  }
  return randomBytes(32).toString("base64url");
};

const resolveHarnessConfiguration = (
  options: InstallHostServiceOptions,
  tools: HostToolInventory,
  existingEnvironment: string
): ResolvedHarnessConfiguration => {
  const codexExecutable = options.codexExecutable ?? tools.codex;
  const openCodeExecutable = options.openCodeExecutable ?? tools.opencode;
  const codexEnabled = options.codexEnabled ?? Boolean(codexExecutable);
  const openCodeEnabled =
    options.openCodeEnabled ?? Boolean(openCodeExecutable);
  assertHarnessExecutables(
    codexEnabled,
    codexExecutable,
    openCodeEnabled,
    openCodeExecutable
  );
  const openCodeManaged = options.openCodeManaged ?? openCodeEnabled;
  const existingPassword = readHostEnvironmentValue(
    existingEnvironment,
    "OPENCODE_SERVER_PASSWORD"
  );
  const openCodePassword = resolveOpenCodePassword(
    options.openCodePassword,
    existingPassword,
    openCodeManaged
  );
  return {
    codexEnabled,
    ...(codexExecutable ? { codexExecutable } : {}),
    openCodeBaseUrl:
      options.openCodeBaseUrl ??
      readHostEnvironmentValue(existingEnvironment, "OPENCODE_BASE_URL") ??
      "http://127.0.0.1:4096",
    openCodeEnabled,
    ...(openCodeExecutable ? { openCodeExecutable } : {}),
    openCodeManaged,
    ...(openCodePassword ? { openCodePassword } : {}),
    openCodeUsername:
      options.openCodeUsername ??
      readHostEnvironmentValue(
        existingEnvironment,
        "OPENCODE_SERVER_USERNAME"
      ) ??
      "vibepad",
  };
};

const createServiceConfiguration = (input: {
  readonly bindAddress: string;
  readonly bunExecutable: string;
  readonly existingTools: HostToolInventory;
  readonly harnesses: ResolvedHarnessConfiguration;
  readonly homeDirectory: string;
  readonly hostName: string;
  readonly options: InstallHostServiceOptions;
  readonly paths: ReturnType<typeof hostServicePaths>;
  readonly port: number;
  readonly projectRoots: readonly string[];
}): HostServiceConfiguration => ({
  ...(input.options.agentBrowserConfig
    ? { agentBrowserConfig: input.options.agentBrowserConfig }
    : {}),
  ...(input.options.agentBrowserExecutable
    ? { agentBrowserExecutable: input.options.agentBrowserExecutable }
    : {}),
  bindAddress: input.bindAddress,
  ...(input.options.browserCdpUrl
    ? { browserCdpUrl: input.options.browserCdpUrl }
    : {}),
  browserEnabled: input.options.browserEnabled ?? false,
  ...(input.options.browserSurfaceUrl
    ? { browserSurfaceUrl: input.options.browserSurfaceUrl }
    : {}),
  bunExecutable: input.bunExecutable,
  ...input.harnesses,
  environmentFile: input.paths.environmentFile,
  hostId: input.hostName,
  hostName: input.hostName,
  logDirectory: input.paths.logDirectory,
  path: pathForService(input.existingTools, input.homeDirectory, [
    input.options.agentBrowserExecutable,
    input.harnesses.codexExecutable,
    input.harnesses.openCodeExecutable,
  ]),
  port: input.port,
  projectRoots: input.projectRoots,
  repoRoot,
  runnerFile: input.paths.runnerFile,
  stateDirectory: input.paths.stateDirectory,
});

export class HostServiceManager {
  readonly #bunExecutable: string;
  readonly #homeDirectory: string;
  readonly #platform: NodeJS.Platform;
  readonly #runner: CommandRunner;

  constructor(options?: {
    readonly bunExecutable?: string;
    readonly homeDirectory?: string;
    readonly platform?: NodeJS.Platform;
    readonly runner?: CommandRunner;
  }) {
    this.#bunExecutable = options?.bunExecutable ?? process.execPath;
    this.#homeDirectory = options?.homeDirectory ?? homedir();
    this.#platform = options?.platform ?? platform();
    this.#runner = options?.runner ?? runCommand;
  }

  async inspect(): Promise<HostServiceInspection> {
    const identity = await discoverTailscaleIdentity(this.#runner);
    const tools = await discoverHostTools(this.#runner, this.#bunExecutable);
    const paths = hostServicePaths(this.#platform, this.#homeDirectory);
    return {
      healthUrl: `http://${identity.bindAddress}:${defaultPort}/health`,
      identity,
      installed: await fileExists(paths.definitionFile),
      platform: this.#platform,
      serviceDefinition: paths.definitionFile,
      tools,
    };
  }

  async install(
    options: InstallHostServiceOptions = {}
  ): Promise<HostServiceInstallResult> {
    const discoveredIdentity = await discoverTailscaleIdentity(this.#runner);
    const tools = await discoverHostTools(this.#runner, this.#bunExecutable);
    const bindAddress = options.bindAddress ?? discoveredIdentity.bindAddress;
    assertSafeBindAddress(bindAddress, options.allowPublicBind ?? false);
    const port = resolvePort(options.port);
    const hostName = resolveHostName(options.hostName, discoveredIdentity);
    const projectRoots = resolveProjectRoots(
      options.projectRoots,
      this.#homeDirectory
    );
    if (!options.skipDependencies) {
      await requireSuccess(this.#runner, this.#bunExecutable, [
        "install",
        "--frozen-lockfile",
        `--cwd=${repoRoot}`,
      ]);
    }

    const paths = hostServicePaths(this.#platform, this.#homeDirectory);
    const existingEnvironment = await readIfPresent(paths.environmentFile);
    const harnesses = resolveHarnessConfiguration(
      options,
      tools,
      existingEnvironment
    );
    const configuration = createServiceConfiguration({
      bindAddress,
      bunExecutable: this.#bunExecutable,
      existingTools: tools,
      harnesses,
      homeDirectory: this.#homeDirectory,
      hostName,
      options,
      paths,
      port,
      projectRoots,
    });
    await Promise.all([
      mkdir(paths.logDirectory, { recursive: true }),
      mkdir(paths.stateDirectory, { recursive: true }),
      mkdir(serviceDefinitionDirectory(paths), { recursive: true }),
    ]);
    await writeAtomic(
      paths.environmentFile,
      renderHostEnvironment(configuration, existingEnvironment),
      0o600
    );
    await writeAtomic(paths.runnerFile, renderHostRunner(configuration), 0o700);
    await writeAtomic(
      paths.definitionFile,
      this.#platform === "darwin"
        ? renderLaunchAgent(configuration)
        : renderSystemdUnit(configuration),
      0o644
    );

    const shouldStart = options.start ?? true;
    if (shouldStart) {
      await this.#activate();
    }
    const healthUrl = `http://${bindAddress}:${port}/health`;
    const healthy = shouldStart ? await waitForHealth(healthUrl) : false;
    return {
      clientUrl: `http://${hostName}:${port}`,
      healthUrl,
      healthy,
      identity: { ...discoveredIdentity, bindAddress, hostName },
      installed: true,
      platform: this.#platform,
      serviceDefinition: paths.definitionFile,
      started: shouldStart,
      tools,
    };
  }

  async restart(): Promise<Pick<HostServiceStatus, "healthUrl" | "healthy">> {
    if (this.#platform === "darwin") {
      const target = `gui/${process.getuid?.() ?? 0}/${serviceLabel}`;
      await requireSuccess(this.#runner, "launchctl", [
        "kickstart",
        "-k",
        target,
      ]);
    } else {
      await requireSuccess(this.#runner, "systemctl", [
        "--user",
        "restart",
        systemdUnitName,
      ]);
    }
    const healthUrl = await this.#installedHealthUrl();
    return { healthUrl, healthy: await waitForHealth(healthUrl) };
  }

  async createPairingCode(): Promise<HostPairingCode> {
    const paths = hostServicePaths(this.#platform, this.#homeDirectory);
    const environment = await readIfPresent(paths.environmentFile);
    if (!environment) {
      throw new Error("Install VibePad Host before creating a pairing code");
    }
    const hostId =
      readHostEnvironmentValue(environment, "VIBEPAD_HOST_ID") ??
      readHostEnvironmentValue(environment, "VIBEPAD_HOST_NAME") ??
      "vibepad-host";
    const hostName =
      readHostEnvironmentValue(environment, "VIBEPAD_HOST_NAME") ?? hostId;
    const port = Number(
      readHostEnvironmentValue(environment, "VIBEPAD_PORT") ?? defaultPort
    );
    const stateDirectory =
      readHostEnvironmentValue(environment, "VIBEPAD_STATE_DIR") ??
      paths.stateDirectory;
    const auth = new HostAuthService({
      databasePath: join(stateDirectory, "host-auth.sqlite"),
      hostId,
      hostName,
    });
    try {
      return {
        ...auth.createPairingCode(),
        clientUrl: `http://${hostName}:${port}`,
        hostId,
        hostName,
      };
    } finally {
      auth.close();
    }
  }

  async status(): Promise<HostServiceStatus> {
    let active: boolean;
    let detail: string;
    if (this.#platform === "darwin") {
      const target = `gui/${process.getuid?.() ?? 0}/${serviceLabel}`;
      const result = await this.#runner("launchctl", ["print", target]);
      active = result.exitCode === 0;
      detail = (result.stdout || result.stderr).trim();
    } else {
      const result = await this.#runner("systemctl", [
        "--user",
        "is-active",
        systemdUnitName,
      ]);
      active = result.exitCode === 0 && result.stdout.trim() === "active";
      detail = (result.stdout || result.stderr).trim();
    }
    const healthUrl = await this.#installedHealthUrl();
    return {
      active,
      detail,
      healthUrl,
      healthy: active && (await healthCheck(healthUrl)),
    };
  }

  async uninstall(): Promise<void> {
    const paths = hostServicePaths(this.#platform, this.#homeDirectory);
    if (this.#platform === "darwin") {
      const target = `gui/${process.getuid?.() ?? 0}/${serviceLabel}`;
      await this.#runner("launchctl", ["bootout", target]);
    } else {
      await this.#runner("systemctl", [
        "--user",
        "disable",
        "--now",
        systemdUnitName,
      ]);
    }
    await Promise.all([
      rm(paths.definitionFile, { force: true }),
      rm(paths.runnerFile, { force: true }),
    ]);
    if (this.#platform === "linux") {
      await requireSuccess(this.#runner, "systemctl", [
        "--user",
        "daemon-reload",
      ]);
    }
  }

  async #activate(): Promise<void> {
    const paths = hostServicePaths(this.#platform, this.#homeDirectory);
    if (this.#platform === "darwin") {
      const domain = `gui/${process.getuid?.() ?? 0}`;
      await this.#runner("launchctl", ["bootout", `${domain}/${serviceLabel}`]);
      await requireSuccess(this.#runner, "launchctl", [
        "bootstrap",
        domain,
        paths.definitionFile,
      ]);
      return;
    }
    await requireSuccess(this.#runner, "systemctl", [
      "--user",
      "daemon-reload",
    ]);
    await requireSuccess(this.#runner, "systemctl", [
      "--user",
      "enable",
      "--now",
      systemdUnitName,
    ]);
  }

  async #installedHealthUrl(): Promise<string> {
    const paths = hostServicePaths(this.#platform, this.#homeDirectory);
    const environment = await readIfPresent(paths.environmentFile);
    const configuredAddress = readHostEnvironmentValue(
      environment,
      "VIBEPAD_HOSTNAME"
    );
    const configuredPort = Number(
      readHostEnvironmentValue(environment, "VIBEPAD_PORT") ?? defaultPort
    );
    const bindAddress =
      configuredAddress ??
      (await discoverTailscaleIdentity(this.#runner)).bindAddress;
    const port =
      Number.isInteger(configuredPort) && configuredPort > 0
        ? configuredPort
        : defaultPort;
    return `http://${bindAddress}:${port}/health`;
  }
}
