import { NativeModule, registerWebModule } from "expo";

import type {
  SshBootstrapInput,
  SshBootstrapNativeModule,
  SshBootstrapResult,
  SshInspectionResult,
  SshInstallAndPairInput,
  SshRecoveryInput,
  SshRecoveryResult,
} from "./vibe-pad-ssh-bootstrap.types";

class SshBootstrapWebModule
  extends NativeModule<Record<never, never>>
  implements SshBootstrapNativeModule
{
  readonly installAndPairAsync = (
    _input: SshInstallAndPairInput
  ): Promise<SshBootstrapResult> =>
    Promise.reject(new Error("SSH setup is available in the VibePad iOS app"));

  readonly inspectAsync = (
    _input: SshBootstrapInput
  ): Promise<SshInspectionResult> =>
    Promise.reject(new Error("SSH setup is available in the VibePad iOS app"));

  readonly recoverHostAsync = (
    _input: SshRecoveryInput
  ): Promise<SshRecoveryResult> =>
    Promise.reject(
      new Error("SSH recovery is available in the VibePad iOS app")
    );
}

export default registerWebModule(SshBootstrapWebModule, "VibePadSshBootstrap");
