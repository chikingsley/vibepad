export interface SecureSignerPublicKey {
  readonly alias: string;
  readonly crv: "P-256";
  readonly hardwareBacked: boolean;
  readonly kty: "EC";
  readonly x: string;
  readonly y: string;
}

export interface SecureSignerNativeModule {
  readonly deleteKeyAsync: (alias: string) => Promise<void>;
  readonly getOrCreateKeyAsync: (
    alias: string
  ) => Promise<SecureSignerPublicKey>;
  readonly signAsync: (alias: string, signingInput: string) => Promise<string>;
}
