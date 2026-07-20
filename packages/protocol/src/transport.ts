import { z } from "zod";

import { providerManifestSchema } from "./capabilities";
import { modelReferenceSchema, providerCatalogSchema } from "./catalog";
import {
  workspaceFileChangeSchema,
  workspaceFileContentSchema,
  workspaceFileNodeSchema,
} from "./files";
import {
  pendingInteractionSchema,
  permissionDecisionSchema,
} from "./interactions";
import {
  projectSummarySchema,
  readySessionSummarySchema,
  serviceSummarySchema,
  sessionSummarySchema,
} from "./provider";
import { timelinePageSchema } from "./timeline";

export const sendTurnRequestSchema = z.object({
  text: z.string().trim().min(1),
});

export const createSessionRequestSchema = z.object({
  projectId: z.string().min(1),
});

export const renameSessionRequestSchema = z.object({
  title: z.string().trim().min(1).max(200),
});

export const archiveSessionResponseSchema = z.object({
  archived: z.literal(true),
});

export const interruptTurnResponseSchema = z.object({
  interrupted: z.literal(true),
});

export const permissionReplyRequestSchema = z.object({
  decision: permissionDecisionSchema,
  message: z.string().trim().min(1).max(1000).optional(),
});

export const questionReplyRequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("answer"),
    answers: z.array(z.array(z.string().min(1))),
  }),
  z.object({ action: z.literal("reject") }),
]);

export const selectModelRequestSchema = modelReferenceSchema;

export const selectAgentRequestSchema = z.object({
  agentId: z.string().min(1),
});

export const interactionResponseSchema = z.object({
  resolved: z.literal(true),
});

export const hostHealthResponseSchema = z.object({
  host: z.object({
    healthy: z.boolean(),
    id: z.string().min(1),
  }),
  provider: z.object({
    healthy: z.boolean(),
    version: z.string().min(1).optional(),
  }),
  providers: z.array(
    z.object({
      healthy: z.boolean(),
      id: z.string().min(1),
      version: z.string().min(1).optional(),
    })
  ),
});
export type HostHealthResponse = z.infer<typeof hostHealthResponseSchema>;

export const providerListResponseSchema = z.object({
  data: z.array(providerManifestSchema),
});

export const projectListResponseSchema = z.object({
  data: z.array(projectSummarySchema),
});

export const fileListResponseSchema = z.object({
  data: z.array(workspaceFileNodeSchema),
});

export const fileContentResponseSchema = z.object({
  data: workspaceFileContentSchema,
});

export const fileChangeListResponseSchema = z.object({
  data: z.array(workspaceFileChangeSchema),
});

export const sessionListResponseSchema = z.object({
  data: z.array(sessionSummarySchema),
});

export const sessionResponseSchema = z.object({
  data: sessionSummarySchema,
});

export const sessionBootstrapResponseSchema = z.object({
  data: z.object({
    session: readySessionSummarySchema,
    timeline: timelinePageSchema,
  }),
});

export const serviceListResponseSchema = z.object({
  data: z.array(serviceSummarySchema),
});

export const interactionListResponseSchema = z.object({
  data: z.array(pendingInteractionSchema),
});

export const providerCatalogResponseSchema = z.object({
  data: providerCatalogSchema,
});

export const timelineResponseSchema = z.object({
  data: timelinePageSchema,
});
