import { z } from "zod";

export const providerEventKindSchema = z.enum([
  "connection.changed",
  "permission.requested",
  "permission.resolved",
  "provider.event",
  "question.requested",
  "question.resolved",
  "session.updated",
  "timeline.item.removed",
  "timeline.item.upserted",
  "turn.completed",
  "turn.started",
]);
export type ProviderEventKind = z.infer<typeof providerEventKindSchema>;

export const providerEventSchema = z.object({
  eventId: z.string().min(1),
  kind: providerEventKindSchema,
  native: z.unknown(),
  projectId: z.string().min(1),
  providerId: z.string().min(1),
  sequence: z.number().int().nonnegative(),
  sessionId: z.string().min(1),
  timestamp: z.string().datetime({ offset: true }),
});
export type ProviderEvent = z.infer<typeof providerEventSchema>;
