import { z } from "zod";

export const pairingCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-HJ-NP-Z2-9]{4}-?[A-HJ-NP-Z2-9]{4}$/iu);

const httpEndpointSchema = z.url().refine((value) => {
  const { protocol } = new URL(value);
  return protocol === "http:" || protocol === "https:";
}, "Pairing endpoints must use HTTP or HTTPS");

export const pairingInvitationSchema = z
  .object({
    code: pairingCodeSchema,
    endpoints: z.array(httpEndpointSchema).min(1).max(8),
    expiresAt: z.iso.datetime(),
    hostId: z.string().regex(/^[A-Za-z0-9._-]+$/u),
    hostName: z.string().trim().min(1).max(100),
    version: z.literal(1),
  })
  .strict();

export type PairingInvitation = z.infer<typeof pairingInvitationSchema>;

export const pairingInvitationUrl = (invitation: PairingInvitation) => {
  const parsed = pairingInvitationSchema.parse(invitation);
  const url = new URL("vibepad://pair");
  url.searchParams.set("c", parsed.code);
  url.searchParams.set("e", parsed.expiresAt);
  url.searchParams.set("h", parsed.hostId);
  url.searchParams.set("n", parsed.hostName);
  url.searchParams.set("v", String(parsed.version));
  for (const endpoint of parsed.endpoints) {
    url.searchParams.append("u", endpoint);
  }
  return url.toString();
};

export const decodePairingInvitationUrl = (
  candidate: string
): PairingInvitation | undefined => {
  try {
    const url = new URL(candidate);
    const customScheme = url.protocol === "vibepad:" && url.hostname === "pair";
    const webRoute =
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.pathname === "/pair";
    if (!(customScheme || webRoute)) {
      return;
    }
    const parsed = pairingInvitationSchema.safeParse({
      code: url.searchParams.get("c"),
      endpoints: url.searchParams.getAll("u"),
      expiresAt: url.searchParams.get("e"),
      hostId: url.searchParams.get("h"),
      hostName: url.searchParams.get("n"),
      version: Number(url.searchParams.get("v")),
    });
    return parsed.success ? parsed.data : undefined;
  } catch {
    // Malformed external URLs are outside the invitation contract.
  }
};

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
