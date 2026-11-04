import { requireOptionalNativeModule } from "expo";

import type { SshBootstrapNativeModule } from "./vibe-pad-ssh-bootstrap.types";

const unavailable = () =>
  new Error("SSH setup is available in the VibePad iOS app");

export default requireOptionalNativeModule<SshBootstrapNativeModule>(
  "VibePadSshBootstrap"
) ?? {
  inspectAsync: () => Promise.reject(unavailable()),
  installAndPairAsync: () => Promise.reject(unavailable()),
  recoverHostAsync: () => Promise.reject(unavailable()),
};
