import { describe, expect, it } from "vitest";

import {
  type HostServiceConfiguration,
  hostServicePaths,
  readHostEnvironmentValue,
  renderHostEnvironment,
  renderHostRunner,
  renderLaunchAgent,
  renderSystemdUnit,
} from "./service-files";

const configuration: HostServiceConfiguration = {
  agentBrowserConfig:
    "/home/simon/.local/share/vibepad/browser/runtime/agent-browser.json",
  agentBrowserExecutable:
    "/home/simon/.local/share/vibepad/tools/node_modules/.bin/agent-browser",
  bindAddress: "100.121.185.11",
  browserCdpUrl: "http://127.0.0.1:19223",
  browserEnabled: true,
  browserSurfaceUrl: "http://127.0.0.1:16901",
  bunExecutable: "/home/simon/.bun/bin/bun",
  codexEnabled: true,
  codexExecutable:
    "/home/simon/.local/share/vibepad/tools/node_modules/.bin/codex",
  environmentFile: "/home/simon/.config/vibepad/host.env",
  hostId: "gmk",
  hostName: "gmk",
  logDirectory: "/home/simon/.local/state/vibepad",
  openCodeBaseUrl: "http://127.0.0.1:4096",
  openCodeEnabled: true,
  openCodeExecutable:
    "/home/simon/.local/share/vibepad/tools/node_modules/.bin/opencode",
  openCodeManaged: true,
  openCodePassword: "managed-secret",
  openCodeUsername: "vibepad",
  path: "/home/simon/.bun/bin:/usr/bin:/bin",
  port: 4100,
  projectRoots: ["/home/simon/github"],
  repoRoot: "/home/simon/github/vibepad",
  runnerFile: "/home/simon/.local/share/vibepad/run-host.sh",
  stateDirectory: "/home/simon/.local/state/vibepad",
};

describe("VibePad Host service files", () => {
  it("preserves secrets while replacing installer-owned environment values", () => {
    const rendered = renderHostEnvironment(
      configuration,
      "PEACOCKERY_VOICE_API_KEY='protected'\nVIBEPAD_PORT='9999'\n"
    );
    expect(rendered).toContain("PEACOCKERY_VOICE_API_KEY='protected'");
    expect(rendered).toContain("VIBEPAD_PORT='4100'");
    expect(rendered).toContain("VIBEPAD_OPENCODE_MANAGED='1'");
    expect(rendered).toContain("VIBEPAD_BROWSER_ENABLED='1'");
    expect(rendered).toContain(
      "AGENT_BROWSER_CONFIG='/home/simon/.local/share/vibepad/browser/runtime/agent-browser.json'"
    );
    expect(rendered).toContain("OPENCODE_SERVER_PASSWORD='managed-secret'");
    expect(rendered).not.toContain("VIBEPAD_PORT='9999'");
    expect(readHostEnvironmentValue(rendered, "VIBEPAD_HOSTNAME")).toBe(
      "100.121.185.11"
    );
    expect(readHostEnvironmentValue(rendered, "VIBEPAD_PORT")).toBe("4100");
  });

  it("renders a service runner and hardened Linux user unit", () => {
    expect(renderHostRunner(configuration)).toContain(
      "exec '/home/simon/.bun/bin/bun' '/home/simon/github/vibepad/apps/host/src/index.ts'"
    );
    const unit = renderSystemdUnit(configuration);
    expect(unit).toContain("NoNewPrivileges=true");
    expect(unit).toContain(
      "ExecStart=/home/simon/.local/share/vibepad/run-host.sh"
    );
  });

  it("renders a user LaunchAgent and platform-specific paths", () => {
    const launchAgent = renderLaunchAgent({
      ...configuration,
      environmentFile:
        "/Users/simon/Library/Application Support/VibePad/host.env",
      logDirectory: "/Users/simon/Library/Logs/VibePad",
      repoRoot: "/Users/simon/GitHub/vibepad",
      runnerFile:
        "/Users/simon/Library/Application Support/VibePad/run-host.sh",
      stateDirectory: "/Users/simon/Library/Application Support/VibePad",
    });
    expect(launchAgent).toContain("studio.peacockery.vibepad.host");
    expect(launchAgent).toContain(
      "/Users/simon/Library/Application Support/VibePad/run-host.sh"
    );
    expect(hostServicePaths("linux", "/home/simon").definitionFile).toBe(
      "/home/simon/.config/systemd/user/vibepad-host.service"
    );
    expect(hostServicePaths("darwin", "/Users/simon").definitionFile).toBe(
      "/Users/simon/Library/LaunchAgents/studio.peacockery.vibepad.host.plist"
    );
  });
});
