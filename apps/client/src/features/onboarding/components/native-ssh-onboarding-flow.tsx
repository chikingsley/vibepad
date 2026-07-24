import { useValue } from "@legendapp/state/react";
import { decodePairingInvitationUrl } from "@vibepad/protocol/auth";
import type {
  InstallationProgress,
  OnboardingPlatform,
  SshConnectionInput,
} from "@vibepad/protocol/onboarding";
import { createHostProfile } from "@vibepad/protocol/settings";
import SshBootstrap from "@vibepad/ssh-bootstrap";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Platform } from "react-native";

import { subscribeToNearbyHosts } from "@/features/connections/nearby-host-discovery";
import { pairHostInvitation } from "@/features/connections/pair-host";
import { useAppSettingsStore } from "@/features/settings/settings-context";
import { useVibePadHost } from "@/lib/vibepad-host-context";

import {
  createNativeSshOnboardingClient,
  defaultInstallationSelection,
} from "../native-ssh-onboarding";
import {
  createOnboardingStore,
  initialOnboardingState,
} from "../state/onboarding-store";
import { type OnboardingActions, OnboardingScreen } from "./onboarding-screen";

const platform = (): OnboardingPlatform => {
  if (Platform.OS === "web") {
    return "web";
  }
  return Platform.OS === "ios" && Platform.isPad ? "ipad" : "iphone";
};

const developmentSourcePath =
  // biome-ignore lint/complexity/useLiteralKeys: Expo public environment names come from the ProcessEnv index signature.
  process.env["EXPO_PUBLIC_VIBEPAD_SSH_SOURCE_PATH"];

const installationProgress = (computerName: string): InstallationProgress => ({
  computerName,
  steps: [
    { id: "connect-ssh", status: "complete" },
    { id: "inspect", status: "complete" },
    {
      detail: "Installing selected VibePad components",
      id: "install-vibepad-host",
      status: "active",
    },
    { id: "start-host", status: "pending" },
    { id: "start-providers", status: "pending" },
    { id: "pair-device", status: "pending" },
  ],
});

const pairingProgress = (
  progress: InstallationProgress
): InstallationProgress => ({
  ...progress,
  steps: progress.steps.map((step) => {
    if (
      step.id === "install-vibepad-host" ||
      step.id === "start-host" ||
      step.id === "start-providers"
    ) {
      return { ...step, status: "complete" };
    }
    if (step.id === "pair-device") {
      return { ...step, status: "active" };
    }
    return step;
  }),
});

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Computer setup failed";

export function NativeSshOnboardingFlow() {
  const settings = useAppSettingsStore();
  const hostClient = useVibePadHost();
  const storeRef = useRef(createOnboardingStore(initialOnboardingState));
  const store = storeRef.current;
  const state = useValue(store.state$);
  const sshClient = useMemo(
    () =>
      createNativeSshOnboardingClient(SshBootstrap, {
        ...(developmentSourcePath ? { developmentSourcePath } : {}),
      }),
    []
  );
  const credentialsRef = useRef<SshConnectionInput | undefined>(undefined);
  const credentialDefaultsRef = useRef<
    Omit<SshConnectionInput, "password"> | undefined
  >(undefined);
  const pendingPairRef = useRef<
    | {
        readonly automaticStart: boolean;
        readonly endpoint: string;
        readonly paired: { readonly hostId: string; readonly hostName: string };
        readonly recoveryKeyId?: string;
        readonly recoverySsh?: {
          readonly host: string;
          readonly port: number;
          readonly username: string;
        };
      }
    | undefined
  >(undefined);

  useEffect(
    () =>
      subscribeToNearbyHosts((discovery) => {
        if (store.state$.screen.peek() !== "computer-choice") {
          return;
        }
        if (discovery.errorMessage) {
          store.setState({
            discovery: {
              message: discovery.errorMessage,
              status: "permission-required",
            },
            screen: "computer-choice",
          });
          return;
        }
        if (discovery.hosts.length === 0) {
          store.setState({
            discovery: { computers: [], status: "searching" },
            screen: "computer-choice",
          });
          return;
        }
        store.setState({
          discovery: {
            computers: discovery.hosts.map((nearbyHost) => ({
              endpoints: [...nearbyHost.endpoints],
              id: nearbyHost.id,
              name: nearbyHost.name,
            })),
            status: "ready",
          },
          screen: "computer-choice",
        });
      }),
    [store]
  );

  const savePairedHost = useCallback(
    (
      paired: { readonly hostId: string; readonly hostName: string },
      endpoint: string,
      automaticStart: boolean,
      recoveryKeyId?: string,
      recoverySsh?: {
        readonly host: string;
        readonly port: number;
        readonly username: string;
      }
    ) => {
      settings.update((current) => ({
        ...current,
        connections: {
          activeHostId: paired.hostId,
          hosts: [
            ...current.connections.hosts.filter(
              (candidate) => candidate.id !== paired.hostId
            ),
            createHostProfile({
              automaticStart: {
                enabled: automaticStart && Boolean(recoveryKeyId),
                recoveryKeyId: recoveryKeyId ?? null,
                ssh:
                  automaticStart && recoveryKeyId && recoverySsh
                    ? recoverySsh
                    : null,
              },
              id: paired.hostId,
              name: paired.hostName,
              url: endpoint,
            }),
          ],
        },
      }));
    },
    [settings]
  );

  const inspectComputer = useCallback(
    async (input: SshConnectionInput) => {
      credentialsRef.current = input;
      credentialDefaultsRef.current = {
        host: input.host,
        name: input.name,
        port: input.port,
        username: input.username,
      };
      store.setState({
        inspectionStatus: "checking",
        screen: "ssh-credentials",
      });
      try {
        const report = await sshClient.inspect(input);
        store.setState({
          automaticStart: true,
          report,
          screen: "computer-inspection",
        });
      } catch (error) {
        store.setState({
          errorMessage: errorMessage(error),
          inspectionStatus: "idle",
          screen: "ssh-credentials",
        });
      }
    },
    [sshClient, store]
  );

  const install = useCallback(async () => {
    const input = credentialsRef.current;
    const current = store.state$.peek();
    if (!(input && current.screen === "computer-inspection")) {
      return;
    }
    const progress = installationProgress(current.report.computerName);
    try {
      const selection = defaultInstallationSelection(
        current.report,
        current.automaticStart
      );
      store.setState({ progress, screen: "installation" });
      const result = await sshClient.installAndPair(input, selection);
      store.setState({
        progress: pairingProgress(progress),
        screen: "installation",
      });
      const invitation = decodePairingInvitationUrl(result.invitationUrl);
      if (!invitation) {
        throw new Error("The computer returned an invalid pairing invitation");
      }
      const pairedResult = await pairHostInvitation(
        hostClient,
        invitation.endpoints,
        invitation.code
      );
      pendingPairRef.current = {
        automaticStart: selection.automaticStart,
        endpoint: pairedResult.endpoint,
        paired: pairedResult.paired,
        ...(result.recoveryKeyId
          ? {
              recoveryKeyId: result.recoveryKeyId,
              recoverySsh: {
                host: input.host,
                port: input.port,
                username: input.username,
              },
            }
          : {}),
      };
      credentialsRef.current = undefined;
      const enabledProviders: ("codex" | "opencode")[] = [];
      if (selection.enabledComponents.includes("codex")) {
        enabledProviders.push("codex");
      }
      if (selection.enabledComponents.includes("opencode")) {
        enabledProviders.push("opencode");
      }
      store.setState({
        computer: {
          enabledProviders,
          hostId: pairedResult.paired.hostId,
          hostName: pairedResult.paired.hostName,
        },
        screen: "computer-ready",
      });
    } catch (error) {
      credentialsRef.current = undefined;
      store.setState({
        errorMessage: errorMessage(error),
        inspectionStatus: "idle",
        screen: "ssh-credentials",
      });
    }
  }, [hostClient, sshClient, store]);

  const chooseExistingHost = useCallback(() => {
    const current = store.state$.peek();
    if (
      current.screen === "computer-choice" &&
      current.discovery.status === "ready"
    ) {
      const [computer] = current.discovery.computers;
      if (computer) {
        store.setState({
          computer,
          pairingCode: "",
          pairingStatus: "idle",
          screen: "pair-existing",
        });
      }
    }
  }, [store]);

  const toggleComponent = useCallback(
    (componentId: "browser-tools" | "codex" | "opencode" | "vibepad-host") => {
      const current = store.state$.peek();
      if (
        current.screen !== "computer-inspection" ||
        componentId === "vibepad-host"
      ) {
        return;
      }
      store.setState({
        ...current,
        report: {
          ...current.report,
          components: current.report.components.map((component) => {
            if (component.id !== componentId) {
              return component;
            }
            if (component.state === "missing-install-selected") {
              return { ...component, state: "missing-skip-selected" };
            }
            if (component.state === "missing-skip-selected") {
              return { ...component, state: "missing-install-selected" };
            }
            return component;
          }),
        },
      });
    },
    [store]
  );

  const pairExisting = useCallback(
    async (code: string) => {
      const current = store.state$.peek();
      if (current.screen !== "pair-existing") {
        return;
      }
      store.setState({ ...current, pairingStatus: "connecting" });
      try {
        const result = await pairHostInvitation(
          hostClient,
          current.computer.endpoints,
          code
        );
        pendingPairRef.current = {
          automaticStart: false,
          endpoint: result.endpoint,
          paired: result.paired,
        };
        store.setState({
          computer: {
            enabledProviders: ["codex", "opencode"],
            hostId: result.paired.hostId,
            hostName: result.paired.hostName,
          },
          screen: "computer-ready",
        });
      } catch (error) {
        store.setState({
          ...current,
          errorMessage: errorMessage(error),
          pairingStatus: "idle",
        });
      }
    },
    [hostClient, store]
  );

  const finish = useCallback(() => {
    const pending = pendingPairRef.current;
    if (!pending) {
      return;
    }
    savePairedHost(
      pending.paired,
      pending.endpoint,
      pending.automaticStart,
      pending.recoveryKeyId,
      pending.recoverySsh
    );
    pendingPairRef.current = undefined;
  }, [savePairedHost]);

  useEffect(() => {
    if (state.screen !== "computer-ready") {
      return;
    }
    const timer = setTimeout(finish, 1800);
    return () => clearTimeout(timer);
  }, [finish, state.screen]);

  const actions = useMemo<OnboardingActions>(
    () => ({
      back: () => {
        if (state.screen === "runtime-choice") {
          store.setState({ screen: "welcome" });
        } else if (state.screen === "computer-choice") {
          store.setState({ screen: "runtime-choice" });
        } else {
          store.setState({
            discovery: { computers: [], status: "searching" },
            screen: "computer-choice",
          });
        }
      },
      chooseExistingHost,
      chooseSelfHosted: () =>
        store.setState({
          discovery: { computers: [], status: "searching" },
          screen: "computer-choice",
        }),
      chooseSshSetup: () =>
        store.setState({ inspectionStatus: "idle", screen: "ssh-credentials" }),
      continueFromInspection: (automaticStart) => {
        const current = store.state$.peek();
        if (current.screen === "computer-inspection") {
          store.setState({ ...current, automaticStart });
        }
        install().catch(() => undefined);
      },
      finish,
      inspectComputer: (input) => {
        inspectComputer(input).catch(() => undefined);
      },
      pairExisting: (code) => {
        pairExisting(code).catch(() => undefined);
      },
      start: () => store.setState({ screen: "runtime-choice" }),
      toggleComponent,
    }),
    [
      chooseExistingHost,
      finish,
      inspectComputer,
      install,
      pairExisting,
      state.screen,
      store,
      toggleComponent,
    ]
  );

  return (
    <OnboardingScreen
      actions={actions}
      {...(credentialDefaultsRef.current
        ? { initialSshValues: credentialDefaultsRef.current }
        : {})}
      platform={platform()}
      state={state}
    />
  );
}
