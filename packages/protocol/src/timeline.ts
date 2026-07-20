import { z } from "zod";

const timelinePartBaseSchema = z.object({
  id: z.string().min(1),
});

const timelineStatusSchema = z.enum([
  "completed",
  "error",
  "pending",
  "running",
]);

export const timelineMessagePhaseSchema = z.enum([
  "commentary",
  "final-answer",
]);
export type TimelineMessagePhase = z.infer<typeof timelineMessagePhaseSchema>;

export const timelineFileChangeSchema = z.object({
  action: z.enum(["create", "delete", "edit", "move"]),
  additions: z.number().int().nonnegative(),
  content: z.string().optional(),
  deletions: z.number().int().nonnegative(),
  patch: z.string().optional(),
  path: z.string().min(1),
  previousPath: z.string().min(1).optional(),
});
export type TimelineFileChange = Readonly<
  z.infer<typeof timelineFileChangeSchema>
>;

export type TimelinePart = Readonly<
  | {
      readonly format: "markdown" | "plain";
      readonly id: string;
      readonly phase?: TimelineMessagePhase | undefined;
      readonly text: string;
      readonly type: "text";
    }
  | {
      readonly id: string;
      readonly text: string;
      readonly type: "reasoning";
    }
  | {
      readonly action?:
        | "call"
        | "list"
        | "read"
        | "search"
        | "web-search"
        | undefined;
      readonly category?: "agent" | "context" | "generic" | "mcp" | undefined;
      readonly error?: string | undefined;
      readonly id: string;
      readonly input: unknown;
      readonly metadata?: unknown;
      readonly name: string;
      readonly output: unknown;
      readonly status: "completed" | "error" | "pending" | "running";
      readonly target?: string | undefined;
      readonly type: "tool";
    }
  | {
      readonly changes: TimelineFileChange[];
      readonly error?: string | undefined;
      readonly id: string;
      readonly status: "completed" | "error" | "pending" | "running";
      readonly type: "file-change";
    }
  | {
      readonly id: string;
      readonly mime: string;
      readonly name?: string | undefined;
      readonly type: "attachment";
      readonly uri: string;
    }
  | {
      readonly action?: "list" | "read" | "run" | "search" | undefined;
      readonly command: string;
      readonly durationMs?: number | undefined;
      readonly error?: string | undefined;
      readonly exitCode?: number | undefined;
      readonly id: string;
      readonly output: string;
      readonly status: "completed" | "error" | "pending" | "running";
      readonly summary?: string | undefined;
      readonly target?: string | undefined;
      readonly type: "shell";
    }
>;

export const timelinePartSchema = z.discriminatedUnion("type", [
  timelinePartBaseSchema.extend({
    format: z.enum(["markdown", "plain"]),
    phase: timelineMessagePhaseSchema.optional(),
    text: z.string(),
    type: z.literal("text"),
  }),
  timelinePartBaseSchema.extend({
    text: z.string(),
    type: z.literal("reasoning"),
  }),
  timelinePartBaseSchema.extend({
    action: z.enum(["call", "list", "read", "search", "web-search"]).optional(),
    category: z.enum(["agent", "context", "generic", "mcp"]).optional(),
    error: z.string().optional(),
    input: z.unknown(),
    metadata: z.unknown().optional(),
    name: z.string().min(1),
    output: z.unknown(),
    status: timelineStatusSchema,
    target: z.string().optional(),
    type: z.literal("tool"),
  }),
  timelinePartBaseSchema.extend({
    changes: z.array(timelineFileChangeSchema),
    error: z.string().optional(),
    status: timelineStatusSchema,
    type: z.literal("file-change"),
  }),
  timelinePartBaseSchema.extend({
    mime: z.string().min(1),
    name: z.string().min(1).optional(),
    type: z.literal("attachment"),
    uri: z.string().min(1),
  }),
  timelinePartBaseSchema.extend({
    action: z.enum(["list", "read", "run", "search"]).optional(),
    command: z.string(),
    durationMs: z.number().nonnegative().optional(),
    error: z.string().optional(),
    exitCode: z.number().int().optional(),
    output: z.string(),
    status: timelineStatusSchema,
    summary: z.string().optional(),
    target: z.string().optional(),
    type: z.literal("shell"),
  }),
]);

export const timelineItemSchema = z.object({
  completedAt: z.string().datetime({ offset: true }).optional(),
  createdAt: z.string().datetime({ offset: true }),
  id: z.string().min(1),
  kind: z.enum(["compaction", "message", "notice", "shell"]),
  native: z.unknown(),
  parts: z.array(timelinePartSchema),
  role: z.enum(["assistant", "system", "user"]).optional(),
  sessionId: z.string().min(1),
  turnId: z.string().min(1).optional(),
  visibility: z.enum(["primary", "provider-detail"]),
});
export type TimelineItem = Readonly<z.infer<typeof timelineItemSchema>>;

export const timelinePageSchema = z.object({
  items: z.array(timelineItemSchema),
  olderCursor: z.string().min(1).optional(),
});
export type TimelinePage = Readonly<z.infer<typeof timelinePageSchema>>;
