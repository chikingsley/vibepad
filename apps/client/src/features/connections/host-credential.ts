export type HostCredential =
  | {
      readonly kind: "basic";
      readonly password: string;
      readonly username: string;
    }
  | {
      readonly kind: "bearer";
      readonly token: string;
    };

const hostIdentifier = /^[A-Za-z0-9._-]+$/u;

interface HostCredentialCandidate {
  readonly kind?: unknown;
  readonly password?: unknown;
  readonly token?: unknown;
  readonly username?: unknown;
}

export const secureHostCredentialKey = (hostId: string) => {
  if (!hostIdentifier.test(hostId)) {
    throw new Error("Host IDs used for credentials must be storage-safe");
  }
  return `vibepad.host-credential.v1.${hostId}`;
};

export const decodeHostCredential = (
  candidate: unknown
): HostCredential | undefined => {
  if (!(candidate && typeof candidate === "object")) {
    return;
  }
  const value = candidate as HostCredentialCandidate;
  if (
    value.kind === "basic" &&
    typeof value.username === "string" &&
    value.username.length > 0 &&
    typeof value.password === "string" &&
    value.password.length > 0
  ) {
    return {
      kind: "basic",
      password: value.password,
      username: value.username,
    };
  }
  if (
    value.kind === "bearer" &&
    typeof value.token === "string" &&
    value.token.length > 0
  ) {
    return { kind: "bearer", token: value.token };
  }
};
