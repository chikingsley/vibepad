import type { SshInspectionResult } from "@vibepad/ssh-bootstrap";
import { describe, expect, it, vi } from "vitest";

import {
  createNativeSshOnboardingClient,
  defaultInstallationSelection,
} from "./native-ssh-onboarding";

const connection = {
  host: "studio.local",
  name: "Studio Mac",
  password: "secret",
  port: 22,
  username: "simon",
} as const;

const nativeInspection = {
  automaticStartAvailable: true,
  components: [
    { id: "vibepad-host", state: "missing-install-selected" },
    { id: "codex", state: "installed-ready", version: "codex 0.72.0" },
    { id: "opencode", state: "missing-install-selected" },
    { id: "browser-tools", state: "missing-install-selected" },
  ],
  computerName: "studio",
  sessionId: "7cc71852-9505-48b9-8d57-75723959b354",
} as const satisfies SshInspectionResult;

describe("native SSH onboarding adapter", () => {
  it("inspects before installation and keeps the user-facing computer name", async () => {
    const inspectAsync = vi.fn(async () => ({
      ...nativeInspection,
      components: nativeInspection.components.map((component) => ({
        ...component,
        version: "version" in component ? component.version : null,
      })),
    }));
    const client = createNativeSshOnboardingClient({
      inspectAsync,
      installAndPairAsync: vi.fn(),
    });

    const report = await client.inspect(connection);

    expect(inspectAsync).toHaveBeenCalledWith({
      host: "studio.local",
      password: "secret",
      port: 22,
      username: "simon",
    });
    expect(report.computerName).toBe("Studio Mac");
  });

  it("selects ready and explicitly selected components", () => {
    expect(defaultInstallationSelection(nativeInspection, true)).toEqual({
      automaticStart: true,
      enabledComponents: ["vibepad-host", "codex", "opencode", "browser-tools"],
    });
  });

  it("passes the final enabled component set into installation", async () => {
    const installAndPairAsync = vi.fn(async () => ({
      invitationUrl: "vibepad://pair?c=ABCD-2345",
    }));
    const client = createNativeSshOnboardingClient({
      inspectAsync: vi.fn(),
      installAndPairAsync,
    });
    const selection = defaultInstallationSelection(nativeInspection, true);

    await client.installAndPair(connection, selection);

    expect(installAndPairAsync).toHaveBeenCalledWith({
      automaticStart: true,
      enabledComponents: ["vibepad-host", "codex", "opencode", "browser-tools"],
      host: "studio.local",
      name: "Studio Mac",
      password: "secret",
      port: 22,
      username: "simon",
    });
  });

  it("passes an explicit development checkout only when configured", async () => {
    const installAndPairAsync = vi.fn(async () => ({
      invitationUrl: "vibepad://pair?c=ABCD-2345",
    }));
    const client = createNativeSshOnboardingClient(
      { inspectAsync: vi.fn(), installAndPairAsync },
      { developmentSourcePath: "/opt/vibepad-acceptance" }
    );

    await client.installAndPair(
      connection,
      defaultInstallationSelection(nativeInspection, true)
    );

    expect(installAndPairAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        developmentSourcePath: "/opt/vibepad-acceptance",
      })
    );
  });

  it("removes Expo and Swift implementation details from native failures", async () => {
    const inspectAsync = vi.fn(() =>
      Promise.reject(
        new Error(
          "FunctionCallException: Calling inspectAsync failed\n→ Caused by: SshAuthenticationFailed: SSH sign-in failed. Check the user and password for studio.local. (at VibePadSshBootstrapModule.swift:48)"
        )
      )
    );
    const client = createNativeSshOnboardingClient({
      inspectAsync,
      installAndPairAsync: vi.fn(),
    });

    await expect(client.inspect(connection)).rejects.toThrow(
      "SSH sign-in failed. Check the user and password for studio.local."
    );
  });
});
