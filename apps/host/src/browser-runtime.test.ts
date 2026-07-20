import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  browserComposeProject,
  browserRuntimePaths,
  defaultBrowserCdpPort,
  defaultBrowserSurfacePort,
  renderAgentBrowserConfig,
  renderBrowserComposeEnvironment,
  VibePadBrowserRuntime,
} from "./browser-runtime";
import type { CommandRunner } from "./service-discovery";

const temporaryDirectories: string[] = [];

const temporaryHome = async () => {
  const directory = await mkdtemp(join(tmpdir(), "vibepad-browser-test-"));
  temporaryDirectories.push(directory);
  return directory;
};

const successfulRunner =
  (calls: string[][]): CommandRunner =>
  (executable, args) => {
    calls.push([executable, ...args]);
    return Promise.resolve({ exitCode: 0, stderr: "", stdout: "" });
  };

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { force: true, recursive: true }))
  );
});

describe("VibePad Browser runtime", () => {
  it("renders a wholly VibePad-owned profile and Agent Browser contract", async () => {
    const home = await temporaryHome();
    const paths = browserRuntimePaths("linux", home);
    const configuration = {
      cdpPort: defaultBrowserCdpPort,
      image: "kasmweb/chrome:test",
      surfacePort: defaultBrowserSurfacePort,
    };
    const environment = renderBrowserComposeEnvironment(paths, configuration);
    const agentBrowser = JSON.parse(
      renderAgentBrowserConfig(paths, configuration)
    ) as Record<string, unknown>;
    const surfaceProxy = await readFile(paths.proxyConfig, "utf8");

    expect(paths.profileDirectory).toBe(
      join(home, ".local/share/vibepad/browser/profiles/default")
    );
    expect(paths.profileDirectory).not.toContain("/docker/kasm");
    expect(environment).toContain(
      `VIBEPAD_BROWSER_PROFILE_DIR=${JSON.stringify(paths.profileDirectory)}`
    );
    expect(agentBrowser).toMatchObject({
      cdp: `http://127.0.0.1:${defaultBrowserCdpPort}`,
      namespace: "vibepad",
      session: "vibepad-live",
    });
    expect(surfaceProxy).toContain(
      "proxy_set_header Origin https://127.0.0.1:6901;"
    );
  });

  it("installs private runtime files without changing global browser config", async () => {
    const home = await temporaryHome();
    const calls: string[][] = [];
    const runtime = new VibePadBrowserRuntime({
      homeDirectory: home,
      platform: "linux",
      runner: successfulRunner(calls),
    });

    const result = await runtime.install({ start: false });
    const paths = browserRuntimePaths("linux", home);
    const [environmentMode, configMode, config] = await Promise.all([
      stat(paths.composeEnvironment).then((value) =>
        value.mode.toString(8).slice(-3)
      ),
      stat(paths.agentBrowserConfig).then((value) =>
        value.mode.toString(8).slice(-3)
      ),
      readFile(paths.agentBrowserConfig, "utf8"),
    ]);

    expect(environmentMode).toBe("600");
    expect(configMode).toBe("600");
    expect(config).toContain(`"namespace": "vibepad"`);
    expect(result).toMatchObject({
      composeProject: browserComposeProject,
      containersActive: false,
      healthy: false,
    });
    expect(calls).toContainEqual([
      "docker",
      "version",
      "--format",
      "{{.Server.Version}}",
    ]);
    expect(calls.some((call) => call.includes("up"))).toBe(false);
  });

  it("rejects an occupied loopback port before asking Docker to start", async () => {
    const home = await temporaryHome();
    const calls: string[][] = [];
    const occupied = createServer();
    await new Promise<void>((resolveListening) => {
      occupied.listen({ host: "127.0.0.1", port: 0 }, resolveListening);
    });
    const address = occupied.address();
    if (!(address && typeof address === "object")) {
      throw new Error("The test server did not expose a TCP port");
    }
    const runtime = new VibePadBrowserRuntime({
      cdpPort: address.port,
      homeDirectory: home,
      platform: "linux",
      runner: successfulRunner(calls),
      surfacePort: address.port === 16_901 ? 16_902 : 16_901,
    });

    try {
      await expect(runtime.install()).rejects.toThrow(
        `CDP port ${address.port} is already in use`
      );
      expect(calls.some((call) => call.includes("up"))).toBe(false);
    } finally {
      await new Promise<void>((resolveClosed, rejectClosed) => {
        occupied.close((error) => {
          if (error) {
            rejectClosed(error);
            return;
          }
          resolveClosed();
        });
      });
    }
  });

  it("snapshots restorable tabs before gracefully stopping Chrome", async () => {
    const home = await temporaryHome();
    const calls: string[][] = [];
    const runtime = new VibePadBrowserRuntime({
      fetcher: (input) => {
        const url = String(input);
        if (url.endsWith("/json/list")) {
          return Promise.resolve(
            Response.json([
              { id: "page-1", type: "page", url: "https://example.com/" },
              { id: "page-2", type: "page", url: "chrome://newtab/" },
              {
                id: "worker-1",
                type: "service_worker",
                url: "https://example.com/worker.js",
              },
            ])
          );
        }
        return Promise.resolve(new Response(null, { status: 200 }));
      },
      homeDirectory: home,
      platform: "linux",
      runner: successfulRunner(calls),
    });

    await runtime.install({ start: false });
    await runtime.stop();

    const targetState = JSON.parse(
      await readFile(browserRuntimePaths("linux", home).targetState, "utf8")
    ) as Record<string, unknown>;
    const execIndex = calls.findIndex((call) => call.includes("exec"));
    const downIndex = calls.findIndex((call) => call.includes("down"));

    expect(targetState).toEqual({
      urls: ["https://example.com/"],
      version: 1,
    });
    expect(execIndex).toBeGreaterThan(-1);
    expect(downIndex).toBeGreaterThan(execIndex);
  });
});
