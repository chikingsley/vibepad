export interface SshBootstrapInput {
  readonly host: string;
  readonly password: string;
  readonly port?: number;
  readonly username: string;
}

export type SshComponentId =
  | "vibepad-host"
  | "codex"
  | "opencode"
  | "browser-tools";

export type SshComponentState = "installed-ready" | "missing-install-selected";

export interface SshComponentInspection {
  readonly id: SshComponentId;
  readonly state: SshComponentState;
  readonly version?: string | null;
}

export interface SshInspectionResult {
  readonly automaticStartAvailable: boolean;
  readonly components: readonly SshComponentInspection[];
  readonly computerName: string;
  readonly sessionId: string;
}

export interface SshInstallAndPairInput extends SshBootstrapInput {
  readonly automaticStart: boolean;
  readonly developmentSourcePath?: string;
  readonly enabledComponents: readonly SshComponentId[];
  readonly name: string;
}

export interface SshBootstrapResult {
  readonly invitationUrl: string;
  readonly recoveryKeyId?: string | null;
}

export interface SshRecoveryInput {
  readonly host: string;
  readonly port?: number;
  readonly recoveryKeyId: string;
  readonly username: string;
}

export interface SshRecoveryResult {
  readonly hostReady: boolean;
}

export interface SshBootstrapNativeModule {
  readonly inspectAsync: (
    input: SshBootstrapInput
  ) => Promise<SshInspectionResult>;
  readonly installAndPairAsync: (
    input: SshInstallAndPairInput
  ) => Promise<SshBootstrapResult>;
  readonly recoverHostAsync: (
    input: SshRecoveryInput
  ) => Promise<SshRecoveryResult>;
}
