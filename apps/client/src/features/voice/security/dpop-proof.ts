export interface DpopPublicJwk {
  readonly crv: "P-256";
  readonly kty: "EC";
  readonly x: string;
  readonly y: string;
}

export interface DpopProofSigner {
  readonly publicJwk: DpopPublicJwk;
  readonly sha256Base64Url: (value: string) => Promise<string>;
  readonly sign: (signingInput: string) => Promise<string>;
}

export interface DpopProofInput {
  readonly accessToken: string;
  readonly htm: string;
  readonly htu: string;
  readonly issuedAt?: number;
  readonly jti: string;
  readonly nonce?: string;
}

const base64PaddingPattern = /[=]+$/u;

const base64UrlBytes = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(base64PaddingPattern, "");
};

const base64UrlJson = (value: unknown): string =>
  base64UrlBytes(new TextEncoder().encode(JSON.stringify(value)));

export const canonicalDpopHtu = (value: string): string => {
  const url = new URL(value);
  return `${url.origin}${url.pathname}`;
};

export const dpopJwkThumbprint = (
  signer: Pick<DpopProofSigner, "publicJwk" | "sha256Base64Url">
): Promise<string> =>
  signer.sha256Base64Url(
    JSON.stringify({
      crv: signer.publicJwk.crv,
      kty: signer.publicJwk.kty,
      x: signer.publicJwk.x,
      y: signer.publicJwk.y,
    })
  );

export const createDpopProof = async (
  input: DpopProofInput,
  signer: DpopProofSigner
): Promise<string> => {
  const protectedSegment = base64UrlJson({
    alg: "ES256",
    jwk: signer.publicJwk,
    typ: "dpop+jwt",
  });
  const payloadSegment = base64UrlJson({
    ath: await signer.sha256Base64Url(input.accessToken),
    htm: input.htm.toUpperCase(),
    htu: canonicalDpopHtu(input.htu),
    iat: input.issuedAt ?? Math.floor(Date.now() / 1000),
    jti: input.jti,
    ...(input.nonce ? { nonce: input.nonce } : {}),
  });
  const signingInput = `${protectedSegment}.${payloadSegment}`;
  return `${signingInput}.${await signer.sign(signingInput)}`;
};
