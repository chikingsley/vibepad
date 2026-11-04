import { dirname, join } from "node:path";

const environmentAssignmentPattern = /^(?<name>[A-Z_][A-Z0-9_]*)=/u;

export const serviceLabel = "studio.peacockery.vibepad.host";
export const systemdUnitName = "vibepad-host.service";

export interface HostServiceConfiguration {
  readonly agentBrowserConfig?: string;
  readonly agentBrowserExecutable?: string;
  readonly bindAddress: string;
  readonly browserEnabled: boolean;
  readonly codexEnabled: boolean;
  readonly codexExecutable?: string;
  readonly environmentFile: string;
  readonly hostArguments: readonly string[];
  readonly hostExecutable: string;
  readonly hostId: string;
  readonly hostName: string;
  readonly logDirectory: string;
  readonly openCodeBaseUrl: string;
  readonly openCodeEnabled: boolean;
  readonly openCodeExecutable?: string;
  readonly openCodeManaged: boolean;
  readonly openCodePassword?: string;
  readonly openCodeUsername: string;
  readonly path: string;
  readonly port: number;
  readonly projectRoots: readonly string[];
  readonly runnerFile: string;
  readonly stateDirectory: string;
  readonly workingDirectory: string;
}

export interface HostServicePaths {
  readonly definitionFile: string;
  readonly environmentFile: string;
  readonly logDirectory: string;
  readonly runnerFile: string;
  readonly stateDirectory: string;
}

const managedEnvironmentKeys = new Set([
  "AGENT_BROWSER_BIN",
  "AGENT_BROWSER_CONFIG",
  "CODEX_BIN",
  "OPENCODE_BASE_URL",
  "OPENCODE_BIN",
  "OPENCODE_SERVER_PASSWORD",
  "OPENCODE_SERVER_USERNAME",
  "PATH",
  "VIBEPAD_CODEX_ENABLED",
  "VIBEPAD_CODEX_PROJECT_ROOTS",
  "VIBEPAD_HOSTNAME",
  "VIBEPAD_HOST_ID",
  "VIBEPAD_HOST_NAME",
  // The Docker-era CDP and surface URL keys stay managed so upgrades scrub
  // stale values from existing host.env files; they are no longer rendered.
  "VIBEPAD_BROWSER_CDP_URL",
  "VIBEPAD_BROWSER_ENABLED",
  "VIBEPAD_BROWSER_SURFACE_URL",
  "VIBEPAD_OPENCODE_ENABLED",
  "VIBEPAD_OPENCODE_MANAGED",
  "VIBEPAD_PORT",
  "VIBEPAD_STATE_DIR",
]);

const shellQuote = (value: string) => `'${value.replaceAll("'", `'\\''`)}'`;

const xmlEscape = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

export const hostServicePaths = (
  platform: NodeJS.Platform,
  homeDirectory: string
): HostServicePaths => {
  if (platform === "darwin") {
    const stateDirectory = join(
      homeDirectory,
      "Library",
      "Application Support",
      "VibePad"
    );
    return {
      definitionFile: join(
        homeDirectory,
        "Library",
        "LaunchAgents",
        `${serviceLabel}.plist`
      ),
      environmentFile: join(stateDirectory, "host.env"),
      logDirectory: join(homeDirectory, "Library", "Logs", "VibePad"),
      runnerFile: join(stateDirectory, "run-host.sh"),
      stateDirectory,
    };
  }
  if (platform === "linux") {
    const stateDirectory = join(homeDirectory, ".local", "state", "vibepad");
    return {
      definitionFile: join(
        homeDirectory,
        ".config",
        "systemd",
        "user",
        systemdUnitName
      ),
      environmentFile: join(homeDirectory, ".config", "vibepad", "host.env"),
      logDirectory: stateDirectory,
      runnerFile: join(
        homeDirectory,
        ".local",
        "share",
        "vibepad",
        "run-host.sh"
      ),
      stateDirectory,
    };
  }
  throw new Error(`VibePad Host services do not support ${platform}`);
};

const environmentAssignment = (line: string) =>
  environmentAssignmentPattern.exec(line)?.[1];

export const readHostEnvironmentValue = (content: string, key: string) => {
  const prefix = `${key}=`;
  const assignment = content
    .split("\n")
    .find((line) => line.startsWith(prefix));
  if (!assignment) {
    return;
  }
  const value = assignment.slice(prefix.length);
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replaceAll("'\\''", "'");
  }
  return value;
};

export const renderHostEnvironment = (
  configuration: HostServiceConfiguration,
  existing = ""
) => {
  const preserved = existing
    .split("\n")
    .filter((line) => {
      const key = environmentAssignment(line);
      return !(key && managedEnvironmentKeys.has(key));
    })
    .filter((line, index, lines) => line || index < lines.length - 1);
  const managed = [
    `PATH=${shellQuote(configuration.path)}`,
    `VIBEPAD_BROWSER_ENABLED=${shellQuote(configuration.browserEnabled ? "1" : "0")}`,
    `VIBEPAD_CODEX_ENABLED=${shellQuote(configuration.codexEnabled ? "1" : "0")}`,
    ...(configuration.codexExecutable
      ? [`CODEX_BIN=${shellQuote(configuration.codexExecutable)}`]
      : []),
    `VIBEPAD_CODEX_PROJECT_ROOTS=${shellQuote(configuration.projectRoots.join(","))}`,
    `VIBEPAD_HOSTNAME=${shellQuote(configuration.bindAddress)}`,
    `VIBEPAD_HOST_ID=${shellQuote(configuration.hostId)}`,
    `VIBEPAD_HOST_NAME=${shellQuote(configuration.hostName)}`,
    `VIBEPAD_PORT=${shellQuote(String(configuration.port))}`,
    `VIBEPAD_STATE_DIR=${shellQuote(configuration.stateDirectory)}`,
    `VIBEPAD_OPENCODE_ENABLED=${shellQuote(configuration.openCodeEnabled ? "1" : "0")}`,
    `VIBEPAD_OPENCODE_MANAGED=${shellQuote(configuration.openCodeManaged ? "1" : "0")}`,
    `OPENCODE_BASE_URL=${shellQuote(configuration.openCodeBaseUrl)}`,
    `OPENCODE_SERVER_USERNAME=${shellQuote(configuration.openCodeUsername)}`,
    ...(configuration.openCodeExecutable
      ? [`OPENCODE_BIN=${shellQuote(configuration.openCodeExecutable)}`]
      : []),
    ...(configuration.openCodePassword
      ? [
          `OPENCODE_SERVER_PASSWORD=${shellQuote(configuration.openCodePassword)}`,
        ]
      : []),
    ...(configuration.agentBrowserExecutable
      ? [
          `AGENT_BROWSER_BIN=${shellQuote(configuration.agentBrowserExecutable)}`,
        ]
      : []),
    ...(configuration.agentBrowserConfig
      ? [`AGENT_BROWSER_CONFIG=${shellQuote(configuration.agentBrowserConfig)}`]
      : []),
  ];
  return [...preserved, ...managed, ""].join("\n");
};

export const renderHostRunner = (configuration: HostServiceConfiguration) =>
  `#!/bin/sh
set -eu
set -a
. ${shellQuote(configuration.environmentFile)}
set +a
exec ${[configuration.hostExecutable, ...configuration.hostArguments]
    .map(shellQuote)
    .join(" ")}
`;

export const renderSystemdUnit = (configuration: HostServiceConfiguration) =>
  `[Unit]
Description=VibePad Host
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
WorkingDirectory=${configuration.workingDirectory}
ExecStart=${configuration.runnerFile}
Restart=on-failure
RestartSec=3
KillMode=mixed
NoNewPrivileges=true
PrivateTmp=true
UMask=0077

[Install]
WantedBy=default.target
`;

export const renderLaunchAgent = (configuration: HostServiceConfiguration) => {
  const outputPath = join(configuration.logDirectory, "host.log");
  const errorPath = join(configuration.logDirectory, "host.error.log");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${serviceLabel}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xmlEscape(configuration.runnerFile)}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${xmlEscape(configuration.workingDirectory)}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>3</integer>
  <key>ProcessType</key>
  <string>Background</string>
  <key>StandardOutPath</key>
  <string>${xmlEscape(outputPath)}</string>
  <key>StandardErrorPath</key>
  <string>${xmlEscape(errorPath)}</string>
</dict>
</plist>
`;
};

export const serviceDefinitionDirectory = (paths: HostServicePaths) =>
  dirname(paths.definitionFile);
