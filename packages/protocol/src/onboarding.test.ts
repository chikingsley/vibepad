import { describe, expect, it } from "vitest";

import {
  computerInspectionSchema,
  installationProgressSchema,
  onboardingStateSchema,
  sshConnectionInputSchema,
} from "./onboarding";

describe("onboarding protocol", () => {
  it("accepts every first-run screen as a discriminated state", () => {
    const states = [
      { screen: "welcome" },
      { screen: "runtime-choice" },
      {
        discovery: { computers: [], status: "searching" },
        screen: "computer-choice",
      },
      {
        computer: {
          endpoints: ["http://192.168.1.40:4100"],
          id: "studio",
          name: "Studio Mac",
        },
        errorMessage: "Code expired",
        pairingCode: "ABCD-2345",
        pairingStatus: "idle",
        screen: "pair-existing",
      },
    ];

    for (const state of states) {
      expect(onboardingStateSchema.safeParse(state).success).toBe(true);
    }
  });

  it("keeps SSH credentials inside their transport boundary", () => {
    expect(
      sshConnectionInputSchema.safeParse({
        host: "studio.local",
        name: "Studio Mac",
        password: "secret",
        port: 22,
        username: "simon",
      }).success
    ).toBe(true);
    expect(
      sshConnectionInputSchema.safeParse({
        host: "studio.local",
        name: "Studio Mac",
        password: "secret",
        port: 0,
        username: "simon",
      }).success
    ).toBe(false);
  });

  it("represents inspection and structured installation progress", () => {
    const inspection = computerInspectionSchema.parse({
      automaticStartAvailable: true,
      components: [
        { id: "vibepad-host", state: "missing-install-selected" },
        { id: "codex", state: "installed-ready", version: "1.2.3" },
        { id: "opencode", state: "missing-skip-selected" },
      ],
      computerName: "Studio Mac",
      sessionId: "7cc71852-9505-48b9-8d57-75723959b354",
    });
    const progress = installationProgressSchema.parse({
      computerName: inspection.computerName,
      steps: [
        { id: "connect-ssh", status: "complete" },
        { id: "install-vibepad-host", progress: 0.5, status: "active" },
        { id: "pair-device", status: "pending" },
      ],
    });

    expect(progress.steps[1]?.progress).toBe(0.5);
  });
});
