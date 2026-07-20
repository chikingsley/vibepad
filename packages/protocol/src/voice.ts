import { z } from "zod";

export const voiceCleanupPromptProfileSchema = z.enum(["coding", "light"]);

export type VoiceCleanupPromptProfile = z.infer<
  typeof voiceCleanupPromptProfileSchema
>;

const realtimeEventBaseSchema = z.object({
  protocol_version: z.literal(1),
  sequence: z.number().int().nonnegative(),
  session_id: z.string().min(1),
});

const transcriptEventSchema = realtimeEventBaseSchema.extend({
  speech_final: z.boolean().optional(),
  text: z.string(),
  type: z.enum([
    "transcript.committed",
    "transcript.delta",
    "transcript.interim",
  ]),
});

const transcriptionArtifactSchema = z.object({
  content: z.object({
    text: z.string(),
  }),
});

export const realtimeVoiceEventSchema = z.union([
  realtimeEventBaseSchema.extend({
    language: z.string().nullable(),
    model: z.string().min(1),
    type: z.literal("session.started"),
  }),
  transcriptEventSchema,
  realtimeEventBaseSchema.extend({
    result: transcriptionArtifactSchema,
    status: z.literal("succeeded"),
    type: z.literal("session.completed"),
  }),
  realtimeEventBaseSchema.extend({
    error: z.object({
      code: z.enum(["provider_error", "session_error"]),
      message: z.string(),
      retryable: z.boolean(),
    }),
    result: transcriptionArtifactSchema,
    status: z.literal("failed"),
    type: z.literal("session.failed"),
  }),
]);

export type RealtimeVoiceEvent = z.infer<typeof realtimeVoiceEventSchema>;

export const voiceRealtimeClientCommandSchema = z.object({
  type: z.literal("close"),
});

export const voiceRealtimePath = "/v1/voice/realtime";
export const voiceRealtimeModel = "elevenlabs-scribe_v2";

export const voiceCleanupModelsPath = "/v1/voice/models";
export const voiceCleanupPath = "/v1/voice/cleanup";

export const voiceCleanupModelSchema = z
  .object({
    displayScore: z.number().min(0).max(10).optional(),
    id: z.string().min(1),
    profile: z.string().min(1).optional(),
    provider: z.string().min(1),
    reasoningProfile: z.enum(["low", "medium", "minimal", "none"]).optional(),
  })
  .strict();

export type VoiceCleanupModel = z.infer<typeof voiceCleanupModelSchema>;

export const voiceCleanupModelListResponseSchema = z
  .object({
    data: z.array(voiceCleanupModelSchema),
  })
  .strict();

export const voiceCleanupRequestSchema = z
  .object({
    model: z.string().min(1),
    promptProfile: voiceCleanupPromptProfileSchema,
    text: z.string().min(1),
  })
  .strict();

export type VoiceCleanupRequest = z.infer<typeof voiceCleanupRequestSchema>;

export const voiceCleanupResultSchema = z
  .object({
    finishReason: z.string(),
    model: z.string().min(1),
    provider: z.string().min(1),
    text: z.string().min(1),
    upstreamModel: z.string().min(1),
  })
  .strict();

export type VoiceCleanupResult = z.infer<typeof voiceCleanupResultSchema>;

export const voiceCleanupResponseSchema = z
  .object({
    data: voiceCleanupResultSchema,
  })
  .strict();
