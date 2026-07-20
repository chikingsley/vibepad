export interface SecureSignerPublicKey {
  readonly alias: string;
  readonly crv: "P-256";
  readonly hardwareBacked: boolean;
  readonly kty: "EC";
  readonly x: string;
  readonly y: string;
}
