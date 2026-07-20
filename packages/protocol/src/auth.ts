import { z } from "zod";

export const pairingCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-HJ-NP-Z2-9]{4}-?[A-HJ-NP-Z2-9]{4}$/iu);

export const clientInstallationMetadataSchema = z
  .object({
    appId: z.string().trim().min(1).max(256),
    appVersion: z.string().trim().min(1).max(256),
    clientVersion: z.string().trim().min(1).max(256),
    deviceModel: z.string().trim().min(1).max(256),
    installationId: z.string().uuid(),
    osVersion: z.string().trim().min(1).max(256),
    platform: z.string().trim().min(1).max(256),
  })
  .strict();

export type ClientInstallationMetadata = z.infer<
  typeof clientInstallationMetadataSchema
>;

export const pairHostRequestSchema = z
  .object({
    clientMetadata: clientInstallationMetadataSchema,
    code: pairingCodeSchema,
    deviceName: z.string().trim().min(1).max(100),
  })
  .strict();

export type PairHostRequest = z.infer<typeof pairHostRequestSchema>;

export const pairedHostSchema = z
  .object({
    deviceId: z.string().uuid(),
    hostId: z.string().min(1),
    hostName: z.string().min(1),
    token: z.string().min(32),
  })
  .strict();

export type PairedHost = z.infer<typeof pairedHostSchema>;

export const pairHostResponseSchema = z
  .object({
    data: pairedHostSchema,
  })
  .strict();

export const revokeHostResponseSchema = z
  .object({
    revoked: z.literal(true),
  })
  .strict();

export const pairHostPath = "/v1/pairing/redeem";
export const revokeHostPath = "/v1/auth/device";
export const hostAuthWebSocketProtocolPrefix = "vibepad-token.";
export const hostAuthWebSocketProtocol = (token: string) =>
  `${hostAuthWebSocketProtocolPrefix}${token}`;
