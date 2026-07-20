import { type NativeModule, requireNativeModule } from "expo";

import type { SecureSignerPublicKey } from "./vibe-pad-secure-signer.types";

interface SecureSignerNativeModule extends NativeModule {
  readonly deleteKeyAsync: (alias: string) => Promise<void>;
  readonly getOrCreateKeyAsync: (
    alias: string
  ) => Promise<SecureSignerPublicKey>;
  readonly signAsync: (alias: string, signingInput: string) => Promise<string>;
}

export default requireNativeModule<SecureSignerNativeModule>(
  "VibePadSecureSigner"
);
