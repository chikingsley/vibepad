import { requireOptionalNativeModule } from "expo";

import type { SecureSignerPublicKey } from "./vibe-pad-secure-signer.types";

interface SecureSignerNativeModule {
  readonly deleteKeyAsync: (alias: string) => Promise<void>;
  readonly getOrCreateKeyAsync: (
    alias: string
  ) => Promise<SecureSignerPublicKey>;
  readonly signAsync: (alias: string, signingInput: string) => Promise<string>;
}

const unavailable = () =>
  new Error("Device-bound VibePad signing is unavailable in this build");

export default requireOptionalNativeModule<SecureSignerNativeModule>(
  "VibePadSecureSigner"
) ?? {
  deleteKeyAsync: () => Promise.reject(unavailable()),
  getOrCreateKeyAsync: () => Promise.reject(unavailable()),
  signAsync: () => Promise.reject(unavailable()),
};
