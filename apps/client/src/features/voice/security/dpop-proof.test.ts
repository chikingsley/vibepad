import { describe, expect, it } from "vitest";

import {
  canonicalDpopHtu,
  createDpopProof,
  type DpopProofSigner,
  dpopJwkThumbprint,
} from "./dpop-proof";

const paddingPattern = /[=]+$/u;

const base64Url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(paddingPattern, "");

const decodeBase64Url = (value: string): Uint8Array<ArrayBuffer> => {
  const standard = value.replaceAll("-", "+").replaceAll("_", "/");
  const decoded = atob(
    standard.padEnd(standard.length + ((4 - (standard.length % 4)) % 4), "=")
  );
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }
  return bytes;
};

const decodeJson = (segment: string): Record<string, unknown> =>
  JSON.parse(new TextDecoder().decode(decodeBase64Url(segment))) as Record<
    string,
    unknown
  >;

const testSigner = async (): Promise<{
  readonly key: CryptoKey;
  readonly signer: DpopProofSigner;
}> => {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
  const jwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  if (!(jwk.x && jwk.y)) {
    throw new Error("test P-256 key is missing public coordinates");
  }
  return {
    key: keyPair.publicKey,
    signer: {
      publicJwk: { crv: "P-256", kty: "EC", x: jwk.x, y: jwk.y },
      sha256Base64Url: async (value) =>
        base64Url(
          new Uint8Array(
            await crypto.subtle.digest(
              "SHA-256",
              new TextEncoder().encode(value)
            )
          )
        ),
      sign: async (input) =>
        base64Url(
          new Uint8Array(
            await crypto.subtle.sign(
              { hash: "SHA-256", name: "ECDSA" },
              keyPair.privateKey,
              new TextEncoder().encode(input)
            )
          )
        ),
    },
  };
};

describe("DPoP proof", () => {
  it("normalizes the request URI without query or fragment data", () => {
    expect(
      canonicalDpopHtu(
        "https://voice.peacockery.studio/v1/realtime?model=scribe#ignored"
      )
    ).toBe("https://voice.peacockery.studio/v1/realtime");
  });

  it("builds an RFC 9449 ES256 proof bound to the token and nonce", async () => {
    const { key, signer } = await testSigner();
    const proof = await createDpopProof(
      {
        accessToken: "pvc_example",
        htm: "get",
        htu: "https://voice.peacockery.studio/v1/models?kind=language",
        issuedAt: 1_721_000_000,
        jti: "proof-test-1",
        nonce: "server-nonce",
      },
      signer
    );
    const [headerSegment, payloadSegment, signatureSegment] = proof.split(".");
    expect(headerSegment).toBeTruthy();
    expect(payloadSegment).toBeTruthy();
    expect(signatureSegment).toBeTruthy();
    expect(decodeJson(headerSegment ?? "")).toEqual({
      alg: "ES256",
      jwk: signer.publicJwk,
      typ: "dpop+jwt",
    });
    expect(decodeJson(payloadSegment ?? "")).toEqual({
      ath: await signer.sha256Base64Url("pvc_example"),
      htm: "GET",
      htu: "https://voice.peacockery.studio/v1/models",
      iat: 1_721_000_000,
      jti: "proof-test-1",
      nonce: "server-nonce",
    });
    expect(
      await crypto.subtle.verify(
        { hash: "SHA-256", name: "ECDSA" },
        key,
        decodeBase64Url(signatureSegment ?? ""),
        new TextEncoder().encode(`${headerSegment}.${payloadSegment}`)
      )
    ).toBe(true);
    expect(await dpopJwkThumbprint(signer)).toHaveLength(43);
  });
});
