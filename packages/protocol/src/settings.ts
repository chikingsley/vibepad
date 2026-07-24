import { z } from "zod";

import { voiceCleanupPromptProfileSchema, voiceRealtimeModel } from "./voice";

export const appSettingsSchemaVersion = 5 as const;
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

const legacyHostProfileSchema = z
  .object({
    id: z.string().regex(/^[A-Za-z0-9._-]+$/u),
    name: z.string().min(1).max(100),
    url: z.url(),
  })
  .strict();

export const hostAutomaticStartSchema = z
  .object({
    enabled: z.boolean(),
    recoveryKeyId: z.string().trim().min(1).nullable(),
    ssh: z
      .object({
        host: z.string().trim().min(1),
        port: z.number().int().min(1).max(65_535),
        username: z.string().trim().min(1),
      })
      .strict()
      .nullable(),
  })
  .strict();

export const hostProfileSchema = legacyHostProfileSchema
  .extend({ automaticStart: hostAutomaticStartSchema })
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
        hosts: z.array(legacyHostProfileSchema),
      })
      .strict(),
    schemaVersion: z.literal(2),
    timeline: timelineSettingsSchema,
    voice: voiceSettingsV2Schema,
  })
  .strict();

const appSettingsV3Schema = z
  .object({
    connections: z
      .object({
        activeHostId: z.string().min(1).nullable(),
        hosts: z.array(legacyHostProfileSchema),
      })
      .strict(),
    schemaVersion: z.literal(3),
    timeline: timelineSettingsSchema,
    voice: voiceSettingsSchema,
  })
  .strict();

const appSettingsV4Schema = z
  .object({
    connections: z
      .object({
        activeHostId: z.string().min(1).nullable(),
        hosts: z.array(
          legacyHostProfileSchema
            .extend({
              automaticStart: z
                .object({
                  enabled: z.boolean(),
                  recoveryKeyId: z.string().trim().min(1).nullable(),
                })
                .strict(),
            })
            .strict()
        ),
      })
      .strict(),
    schemaVersion: z.literal(4),
    timeline: timelineSettingsSchema,
    voice: voiceSettingsSchema,
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

export const createHostProfile = (
  input: Omit<HostProfile, "automaticStart"> & {
    readonly automaticStart?: HostProfile["automaticStart"];
  }
): HostProfile =>
  hostProfileSchema.parse({
    ...input,
    automaticStart: input.automaticStart ?? {
      enabled: false,
      recoveryKeyId: null,
      ssh: null,
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
      connections: {
        ...versionTwo.data.connections,
        hosts: versionTwo.data.connections.hosts.map(createHostProfile),
      },
      schemaVersion: appSettingsSchemaVersion,
      voice: { ...versionTwo.data.voice, transport: "host" },
    };
  }
  const versionThree = appSettingsV3Schema.safeParse(candidate);
  if (versionThree.success) {
    return {
      ...versionThree.data,
      connections: {
        ...versionThree.data.connections,
        hosts: versionThree.data.connections.hosts.map(createHostProfile),
      },
      schemaVersion: appSettingsSchemaVersion,
    };
  }
  const versionFour = appSettingsV4Schema.safeParse(candidate);
  if (versionFour.success) {
    return {
      ...versionFour.data,
      connections: {
        ...versionFour.data.connections,
        hosts: versionFour.data.connections.hosts.map((host) => ({
          ...host,
          automaticStart: {
            ...host.automaticStart,
            enabled: false,
            ssh: null,
          },
        })),
      },
      schemaVersion: appSettingsSchemaVersion,
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
