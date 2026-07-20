import type {
  ClientInstallationMetadata,
  PairedHost,
  PairHostRequest,
} from "@vibepad/protocol/auth";

export type HostAuthErrorCode =
  | "host_auth_unavailable"
  | "pairing_code_invalid"
  | "pairing_rate_limited"
  | "unauthorized";

export class HostAuthError extends Error {
  readonly code: HostAuthErrorCode;
  readonly retryAfterSeconds: number | undefined;
  readonly status: number;

  constructor(
    code: HostAuthErrorCode,
    message: string,
    status: number,
    retryAfterSeconds?: number
  ) {
    super(message);
    this.name = "HostAuthError";
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
    this.status = status;
  }
}

export interface HostAuthPrincipal {
  readonly clientMetadata: ClientInstallationMetadata;
  readonly deviceId: string;
  readonly deviceName: string;
}

export interface HostAuthController {
  readonly authenticateAuthorization: (
    authorization: string | null
  ) => HostAuthPrincipal | undefined;
  readonly authenticateToken: (token: string) => HostAuthPrincipal | undefined;
  readonly redeem: (
    input: PairHostRequest,
    sourceAddress?: string
  ) => PairedHost;
  readonly revokeAuthorization: (authorization: string | null) => boolean;
}

export const isLoopbackAddress = (address: string | undefined) =>
  !address ||
  address === "127.0.0.1" ||
  address === "::1" ||
  address === "::ffff:127.0.0.1";

export const isTrustedLocalRequest = (
  address: string | undefined,
  origin: string | null
) => isLoopbackAddress(address) && !origin;
