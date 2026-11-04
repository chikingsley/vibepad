import { requireOptionalNativeModule } from "expo";

import type { SecureSignerNativeModule } from "./vibe-pad-secure-signer.types";

const unavailable = () =>
  new Error("Device-bound VibePad signing is unavailable in this build");

export default requireOptionalNativeModule<SecureSignerNativeModule>(
  "VibePadSecureSigner"
) ?? {
  deleteKeyAsync: () => Promise.reject(unavailable()),
  getOrCreateKeyAsync: () => Promise.reject(unavailable()),
  signAsync: () => Promise.reject(unavailable()),
};
