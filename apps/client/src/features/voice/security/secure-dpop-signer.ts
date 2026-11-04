import SecureSignerModule, {
  type SecureSignerPublicKey,
  // biome-ignore lint/correctness/noUndeclaredDependencies: This local Expo module resolves through the tsconfig path alias, not package.json.
} from "@vibepad/secure-signer";
import {
  CryptoDigestAlgorithm,
  CryptoEncoding,
  digestStringAsync,
} from "expo-crypto";

import {
  createDpopProof,
  type DpopProofInput,
  type DpopProofSigner,
  dpopJwkThumbprint,
} from "./dpop-proof";

const base64PaddingPattern = /[=]+$/u;

const sha256Base64Url = async (value: string): Promise<string> =>
  (
    await digestStringAsync(CryptoDigestAlgorithm.SHA256, value, {
      encoding: CryptoEncoding.BASE64,
    })
  )
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(base64PaddingPattern, "");

export interface SecureDpopSigner {
  readonly alias: string;
  readonly hardwareBacked: boolean;
  readonly jkt: string;
  readonly proof: (input: DpopProofInput) => Promise<string>;
  readonly publicKey: SecureSignerPublicKey;
}

export const secureDpopAlias = (
  environment: "lab" | "production",
  installationId: string
): string => `${environment}.${installationId}`;

export const getSecureDpopSigner = async (
  environment: "lab" | "production",
  installationId: string
): Promise<SecureDpopSigner> => {
  const alias = secureDpopAlias(environment, installationId);
  const publicKey = await SecureSignerModule.getOrCreateKeyAsync(alias);
  const signer: DpopProofSigner = {
    publicJwk: {
      crv: publicKey.crv,
      kty: publicKey.kty,
      x: publicKey.x,
      y: publicKey.y,
    },
    sha256Base64Url,
    sign: (signingInput) => SecureSignerModule.signAsync(alias, signingInput),
  };
  return {
    alias,
    hardwareBacked: publicKey.hardwareBacked,
    jkt: await dpopJwkThumbprint(signer),
    proof: (input) => createDpopProof(input, signer),
    publicKey,
  };
};

export const deleteSecureDpopSigner = (
  environment: "lab" | "production",
  installationId: string
): Promise<void> =>
  SecureSignerModule.deleteKeyAsync(
    secureDpopAlias(environment, installationId)
  );
