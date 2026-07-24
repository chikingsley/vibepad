import { z } from "zod";

import { pairingCodeSchema } from "./auth";

export const onboardingPlatformSchema = z.enum(["iphone", "ipad", "web"]);
export type OnboardingPlatform = z.infer<typeof onboardingPlatformSchema>;

export const onboardingCapabilitiesSchema = z
  .object({
    nativeQrScanner: z.boolean(),
    nativeSshSetup: z.boolean(),
    nearbyDiscovery: z.boolean(),
    secureRecoveryKey: z.boolean(),
  })
  .strict();
export type OnboardingCapabilities = z.infer<
  typeof onboardingCapabilitiesSchema
>;

export const nearbyComputerSchema = z
  .object({
    endpoints: z.array(z.url()).min(1).max(8),
    id: z.string().regex(/^[A-Za-z0-9._-]+$/u),
    name: z.string().trim().min(1).max(100),
  })
  .strict();
export type NearbyComputer = z.infer<typeof nearbyComputerSchema>;

export const discoveryStateSchema = z.discriminatedUnion("status", [
  z
    .object({
      computers: z.array(nearbyComputerSchema),
      status: z.literal("searching"),
    })
    .strict(),
  z
    .object({
      computers: z.array(nearbyComputerSchema).min(1),
      status: z.literal("ready"),
    })
    .strict(),
  z.object({ status: z.literal("empty") }).strict(),
  z
    .object({
      message: z.string().trim().min(1),
      status: z.literal("permission-required"),
    })
    .strict(),
  z
    .object({ message: z.string().trim().min(1), status: z.literal("error") })
    .strict(),
]);
export type DiscoveryState = z.infer<typeof discoveryStateSchema>;

export const sshConnectionInputSchema = z
  .object({
    host: z.string().trim().min(1).max(255),
    name: z.string().trim().min(1).max(100),
    password: z.string().min(1),
    port: z.number().int().min(1).max(65_535),
    username: z.string().trim().min(1).max(255),
  })
  .strict();
export type SshConnectionInput = z.infer<typeof sshConnectionInputSchema>;

export const sshSetupSessionIdSchema = z.string().uuid();
export type SshSetupSessionId = z.infer<typeof sshSetupSessionIdSchema>;

export const computerComponentIdSchema = z.enum([
  "vibepad-host",
  "codex",
  "opencode",
  "browser-tools",
]);
export type ComputerComponentId = z.infer<typeof computerComponentIdSchema>;

export const computerComponentStateSchema = z.enum([
  "installed-ready",
  "installed-authentication-required",
  "installed-update-available",
  "missing-install-selected",
  "missing-skip-selected",
  "unavailable",
]);
export type ComputerComponentState = z.infer<
  typeof computerComponentStateSchema
>;

export const computerComponentInspectionSchema = z
  .object({
    id: computerComponentIdSchema,
    state: computerComponentStateSchema,
    version: z.string().trim().min(1).optional(),
  })
  .strict();
export type ComputerComponentInspection = z.infer<
  typeof computerComponentInspectionSchema
>;

export const computerInspectionSchema = z
  .object({
    automaticStartAvailable: z.boolean(),
    components: z.array(computerComponentInspectionSchema).min(1),
    computerName: z.string().trim().min(1).max(100),
    sessionId: sshSetupSessionIdSchema,
  })
  .strict();
export type ComputerInspection = z.infer<typeof computerInspectionSchema>;

export const installationSelectionSchema = z
  .object({
    automaticStart: z.boolean(),
    enabledComponents: z.array(computerComponentIdSchema),
  })
  .strict();
export type InstallationSelection = z.infer<typeof installationSelectionSchema>;

export const installationStepIdSchema = z.enum([
  "connect-ssh",
  "inspect",
  "install-vibepad-host",
  "install-codex",
  "install-opencode",
  "install-browser-tools",
  "start-host",
  "start-providers",
  "configure-automatic-start",
  "pair-device",
]);
export type InstallationStepId = z.infer<typeof installationStepIdSchema>;

export const installationStepSchema = z
  .object({
    detail: z.string().trim().min(1).optional(),
    id: installationStepIdSchema,
    progress: z.number().min(0).max(1).optional(),
    status: z.enum(["pending", "active", "complete", "failed"]),
  })
  .strict();
export type InstallationStep = z.infer<typeof installationStepSchema>;

export const installationProgressSchema = z
  .object({
    computerName: z.string().trim().min(1).max(100),
    steps: z.array(installationStepSchema).min(1),
  })
  .strict();
export type InstallationProgress = z.infer<typeof installationProgressSchema>;

export const pairedComputerSummarySchema = z
  .object({
    enabledProviders: z.array(z.enum(["codex", "opencode"])).min(1),
    hostId: z.string().regex(/^[A-Za-z0-9._-]+$/u),
    hostName: z.string().trim().min(1).max(100),
  })
  .strict();
export type PairedComputerSummary = z.infer<typeof pairedComputerSummarySchema>;

export const onboardingStateSchema = z.discriminatedUnion("screen", [
  z.object({ screen: z.literal("welcome") }).strict(),
  z.object({ screen: z.literal("runtime-choice") }).strict(),
  z
    .object({
      discovery: discoveryStateSchema,
      screen: z.literal("computer-choice"),
    })
    .strict(),
  z
    .object({
      computer: nearbyComputerSchema,
      errorMessage: z.string().trim().min(1).optional(),
      pairingCode: pairingCodeSchema.or(z.literal("")),
      pairingStatus: z.enum(["idle", "connecting"]),
      screen: z.literal("pair-existing"),
    })
    .strict(),
  z
    .object({
      errorMessage: z.string().trim().min(1).optional(),
      inspectionStatus: z.enum(["idle", "checking"]),
      screen: z.literal("ssh-credentials"),
    })
    .strict(),
  z
    .object({
      automaticStart: z.boolean(),
      report: computerInspectionSchema,
      screen: z.literal("computer-inspection"),
    })
    .strict(),
  z
    .object({
      progress: installationProgressSchema,
      screen: z.literal("installation"),
    })
    .strict(),
  z
    .object({
      computer: pairedComputerSummarySchema,
      screen: z.literal("computer-ready"),
    })
    .strict(),
]);
export type OnboardingState = z.infer<typeof onboardingStateSchema>;

export const computerConnectionStatusSchema = z.enum([
  "connecting",
  "connected",
  "starting-host",
  "offline",
  "attention",
]);
export type ComputerConnectionStatus = z.infer<
  typeof computerConnectionStatusSchema
>;

export const computerConnectionRecordSchema = z
  .object({
    errorMessage: z.string().trim().min(1).optional(),
    hostId: z.string().regex(/^[A-Za-z0-9._-]+$/u),
    lastConnectedAt: z.number().int().nonnegative().nullable(),
    status: computerConnectionStatusSchema,
  })
  .strict();
export type ComputerConnectionRecord = z.infer<
  typeof computerConnectionRecordSchema
>;
