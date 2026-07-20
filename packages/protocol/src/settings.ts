import { z } from "zod";

import { voiceCleanupPromptProfileSchema, voiceRealtimeModel } from "./voice";

export const appSettingsSchemaVersion = 3 as const;
export const messageScrollCheckpointSchemaVersion = 1 as const;

export const timelineOpeningPreferenceSchema = z.enum([
  "latest-response",
  "last-position",
  "bottom",
]);

export type TimelineOpeningPreference = z.infer<
  typeof timelineOpeningPreferenceSchema
>;

export type VoiceCleanupPromptProfile = z.infer<
  typeof voiceCleanupPromptProfileSchema
>;

export const hostProfileSchema = z
  .object({
    id: z.string().regex(/^[A-Za-z0-9._-]+$/u),
    name: z.string().min(1).max(100),
    url: z.url(),
  })
  .strict();

export type HostProfile = z.infer<typeof hostProfileSchema>;

const timelineSettingsSchema = z
  .object({
    opening: timelineOpeningPreferenceSchema,
  })
  .strict();

const voiceSettingsSchema = z
  .object({
    cleanup: z
      .object({
        enabled: z.boolean(),
        model: z.string().min(1).nullable(),
        promptProfile: voiceCleanupPromptProfileSchema,
      })
      .strict(),
    showInterimTranscript: z.boolean(),
    transcriptionModel: z.string().min(1),
    transport: z.enum(["host", "hosted"]),
  })
  .strict();

const voiceSettingsV2Schema = voiceSettingsSchema.omit({ transport: true });

const appSettingsV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    timeline: timelineSettingsSchema,
    voice: voiceSettingsV2Schema,
  })
  .strict();

const appSettingsV2Schema = z
  .object({
    connections: z
      .object({
        activeHostId: z.string().min(1).nullable(),
        hosts: z.array(hostProfileSchema),
      })
      .strict(),
    schemaVersion: z.literal(2),
    timeline: timelineSettingsSchema,
    voice: voiceSettingsV2Schema,
  })
  .strict();

export const appSettingsSchema = z
  .object({
    connections: z
      .object({
        activeHostId: z.string().min(1).nullable(),
        hosts: z.array(hostProfileSchema),
      })
      .strict(),
    schemaVersion: z.literal(appSettingsSchemaVersion),
    timeline: timelineSettingsSchema,
    voice: voiceSettingsSchema,
  })
  .strict();

export type AppSettings = z.infer<typeof appSettingsSchema>;

export const createDefaultAppSettings = (): AppSettings => ({
  connections: {
    activeHostId: null,
    hosts: [],
  },
  schemaVersion: appSettingsSchemaVersion,
  timeline: {
    opening: "latest-response",
  },
  voice: {
    cleanup: {
      enabled: false,
      model: null,
      promptProfile: "coding",
    },
    showInterimTranscript: false,
    transcriptionModel: voiceRealtimeModel,
    transport: "host",
  },
});

export const decodeAppSettings = (candidate: unknown): AppSettings => {
  const legacy = appSettingsV1Schema.safeParse(candidate);
  if (legacy.success) {
    return {
      connections: { activeHostId: null, hosts: [] },
      schemaVersion: appSettingsSchemaVersion,
      timeline: legacy.data.timeline,
      voice: { ...legacy.data.voice, transport: "host" },
    };
  }
  const versionTwo = appSettingsV2Schema.safeParse(candidate);
  if (versionTwo.success) {
    return {
      ...versionTwo.data,
      schemaVersion: appSettingsSchemaVersion,
      voice: { ...versionTwo.data.voice, transport: "host" },
    };
  }
  const current = appSettingsSchema.safeParse(candidate);
  return current.success ? current.data : createDefaultAppSettings();
};

export const messageScrollCheckpointSchema = z
  .object({
    anchorId: z.string().min(1),
    offset: z.number().finite().nonnegative(),
    savedAt: z.number().int().nonnegative(),
    schemaVersion: z.literal(messageScrollCheckpointSchemaVersion),
  })
  .strict();

export type MessageScrollCheckpoint = z.infer<
  typeof messageScrollCheckpointSchema
>;

export const decodeMessageScrollCheckpoint = (
  candidate: unknown
): MessageScrollCheckpoint | undefined => {
  const parsed = messageScrollCheckpointSchema.safeParse(candidate);
  return parsed.success ? parsed.data : undefined;
};
