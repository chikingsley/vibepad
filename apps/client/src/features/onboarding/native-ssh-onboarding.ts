import {
  type ComputerComponentInspection,
  type ComputerInspection,
  computerInspectionSchema,
  type InstallationSelection,
  installationSelectionSchema,
  type SshConnectionInput,
  sshConnectionInputSchema,
} from "@vibepad/protocol/onboarding";
import type {
  SshBootstrapInput,
  SshBootstrapResult,
  SshInspectionResult,
  SshInstallAndPairInput,
  // biome-ignore lint/correctness/noUndeclaredDependencies: This local Expo module resolves through the tsconfig path alias, not package.json.
} from "@vibepad/ssh-bootstrap";

interface NativeSshModule {
  readonly inspectAsync: (
    input: SshBootstrapInput
  ) => Promise<SshInspectionResult>;
  readonly installAndPairAsync: (
    input: SshInstallAndPairInput
  ) => Promise<SshBootstrapResult>;
}

const wrappedNativeCausePattern =
  /Caused by:\s*[^:\n]+:\s*(?<cause>.+?)(?:\s+\(at|\n|$)/su;

export interface NativeSshOnboardingClient {
  readonly inspect: (input: SshConnectionInput) => Promise<ComputerInspection>;
  readonly installAndPair: (
    input: SshConnectionInput,
    selection: InstallationSelection
  ) => Promise<SshBootstrapResult>;
}

const connectionInput = (input: SshConnectionInput): SshBootstrapInput => ({
  host: input.host,
  password: input.password,
  port: input.port,
  username: input.username,
});

const cleanNativeError = (error: unknown, fallback: string): Error => {
  const message = error instanceof Error ? error.message : String(error);
  const wrappedCause = message.match(wrappedNativeCausePattern)?.[1];
  if (wrappedCause) {
    return new Error(wrappedCause.trim());
  }
  if (message.includes("FunctionCallException")) {
    return new Error(fallback);
  }
  return new Error(message || fallback);
};

export const defaultInstallationSelection = (
  inspection: {
    readonly components: readonly ComputerComponentInspection[];
  },
  automaticStart: boolean
): InstallationSelection => {
  const enabledComponents = inspection.components
    .filter(
      (component) =>
        component.state === "installed-ready" ||
        component.state === "installed-authentication-required" ||
        component.state === "installed-update-available" ||
        component.state === "missing-install-selected"
    )
    .map((component) => component.id);
  const providerEnabled =
    enabledComponents.includes("codex") ||
    enabledComponents.includes("opencode");
  if (!providerEnabled) {
    throw new Error("Select Codex or OpenCode before installation");
  }
  return installationSelectionSchema.parse({
    automaticStart,
    enabledComponents,
  });
};

export function createNativeSshOnboardingClient(
  nativeModule: NativeSshModule,
  options?: { readonly developmentSourcePath?: string }
): NativeSshOnboardingClient {
  return {
    inspect: async (candidate) => {
      const input = sshConnectionInputSchema.parse(candidate);
      try {
        const nativeReport = await nativeModule.inspectAsync(
          connectionInput(input)
        );
        const report = computerInspectionSchema.parse({
          ...nativeReport,
          components: nativeReport.components.map((component) => ({
            id: component.id,
            state: component.state,
            ...(component.version ? { version: component.version } : {}),
          })),
        });
        return { ...report, computerName: input.name };
      } catch (error) {
        throw cleanNativeError(error, "VibePad could not check this computer.");
      }
    },
    installAndPair: async (candidate, selectionCandidate) => {
      const input = sshConnectionInputSchema.parse(candidate);
      const selection = installationSelectionSchema.parse(selectionCandidate);
      try {
        return await nativeModule.installAndPairAsync({
          ...connectionInput(input),
          automaticStart: selection.automaticStart,
          ...(options?.developmentSourcePath
            ? { developmentSourcePath: options.developmentSourcePath }
            : {}),
          enabledComponents: selection.enabledComponents,
          name: input.name,
        });
      } catch (error) {
        throw cleanNativeError(
          error,
          "VibePad could not finish computer setup."
        );
      }
    },
  };
}
