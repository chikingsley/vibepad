import type {
  OnboardingPlatform,
  OnboardingState,
} from "@vibepad/protocol/onboarding";

export type OnboardingFixtureId =
  | "welcome"
  | "runtime-choice"
  | "computer-searching"
  | "computer-found"
  | "computer-several"
  | "computer-empty"
  | "pair-existing"
  | "ssh-credentials"
  | "computer-inspection"
  | "installation"
  | "computer-ready";

const studioComputer = {
  endpoints: ["http://192.168.1.40:4100"],
  id: "studio-mac",
  name: "Studio Mac",
};

export const onboardingFixtures: Record<OnboardingFixtureId, OnboardingState> =
  {
    "computer-empty": {
      discovery: { status: "empty" },
      screen: "computer-choice",
    },
    "computer-found": {
      discovery: { computers: [studioComputer], status: "ready" },
      screen: "computer-choice",
    },
    "computer-inspection": {
      automaticStart: true,
      report: {
        automaticStartAvailable: true,
        components: [
          {
            id: "vibepad-host",
            state: "missing-install-selected",
          },
          { id: "codex", state: "installed-ready", version: "0.72.0" },
          { id: "opencode", state: "missing-install-selected" },
          { id: "browser-tools", state: "missing-skip-selected" },
        ],
        computerName: "Studio Mac",
        sessionId: "7cc71852-9505-48b9-8d57-75723959b354",
      },
      screen: "computer-inspection",
    },
    "computer-ready": {
      computer: {
        enabledProviders: ["codex", "opencode"],
        hostId: "studio-mac",
        hostName: "Studio Mac",
      },
      screen: "computer-ready",
    },
    "computer-searching": {
      discovery: { computers: [], status: "searching" },
      screen: "computer-choice",
    },
    "computer-several": {
      discovery: {
        computers: [
          studioComputer,
          {
            endpoints: ["http://192.168.1.41:4100"],
            id: "office-linux",
            name: "office-linux",
          },
        ],
        status: "ready",
      },
      screen: "computer-choice",
    },
    installation: {
      progress: {
        computerName: "Studio Mac",
        steps: [
          { id: "connect-ssh", status: "complete" },
          { id: "inspect", status: "complete" },
          {
            detail: "Installing VibePad Host",
            id: "install-vibepad-host",
            progress: 0.62,
            status: "active",
          },
          { id: "install-opencode", status: "pending" },
          { id: "start-host", status: "pending" },
          { id: "pair-device", status: "pending" },
        ],
      },
      screen: "installation",
    },
    "pair-existing": {
      computer: studioComputer,
      pairingCode: "",
      pairingStatus: "idle",
      screen: "pair-existing",
    },
    "runtime-choice": { screen: "runtime-choice" },
    "ssh-credentials": {
      inspectionStatus: "idle",
      screen: "ssh-credentials",
    },
    welcome: { screen: "welcome" },
  };

export const defaultOnboardingPlatform: OnboardingPlatform = "ipad";
