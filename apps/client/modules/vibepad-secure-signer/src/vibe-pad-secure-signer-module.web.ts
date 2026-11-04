import { NativeModule, registerWebModule } from "expo";

import type {
  SecureSignerNativeModule,
  SecureSignerPublicKey,
} from "./vibe-pad-secure-signer.types";

const unavailable = () =>
  new Error("Device-bound VibePad signing is only available on iOS");

class SecureSignerWebModule
  extends NativeModule<Record<never, never>>
  implements SecureSignerNativeModule
{
  readonly deleteKeyAsync = (_alias: string): Promise<void> =>
    Promise.reject(unavailable());

  readonly getOrCreateKeyAsync = (
    _alias: string
  ): Promise<SecureSignerPublicKey> => Promise.reject(unavailable());

  readonly signAsync = (
    _alias: string,
    _signingInput: string
  ): Promise<string> => Promise.reject(unavailable());
}

export default registerWebModule(SecureSignerWebModule, "VibePadSecureSigner");
