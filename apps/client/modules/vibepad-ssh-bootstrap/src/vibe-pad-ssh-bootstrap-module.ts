import { requireOptionalNativeModule } from "expo";

import type {
  SshBootstrapInput,
  SshBootstrapResult,
  SshInspectionResult,
  SshInstallAndPairInput,
  SshRecoveryInput,
  SshRecoveryResult,
} from "./vibe-pad-ssh-bootstrap.types";

interface SshBootstrapNativeModule {
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

const unavailable = () =>
  new Error("SSH setup is available in the VibePad iOS app");

export default requireOptionalNativeModule<SshBootstrapNativeModule>(
  "VibePadSshBootstrap"
) ?? {
  inspectAsync: () => Promise.reject(unavailable()),
  installAndPairAsync: () => Promise.reject(unavailable()),
  recoverHostAsync: () => Promise.reject(unavailable()),
};
