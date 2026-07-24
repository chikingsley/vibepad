import { z } from "zod";
import type { ProviderManifest } from "./capabilities";
import {
  type ModelReference,
  modelReferenceSchema,
  type ProviderCatalog,
} from "./catalog";
import type { ProviderEvent } from "./events";
import type {
  WorkspaceFileChange,
  WorkspaceFileContent,
  WorkspaceFileNode,
} from "./files";
import type {
  PendingInteraction,
  RespondPermissionInput,
  RespondQuestionInput,
} from "./interactions";
import type { TimelinePage } from "./timeline";

export const harnessIdSchema = z.enum([
  "agy",
  "claude-code",
  "codex",
  "opencode",
]);
export type HarnessId = z.infer<typeof harnessIdSchema>;

export const projectSummarySchema = z.object({
  harnessId: harnessIdSchema,
  id: z.string().min(1),
  name: z.string().min(1),
  native: z.unknown(),
  path: z.string().min(1),
});
export type ProjectSummary = Readonly<z.infer<typeof projectSummarySchema>>;

export const sessionActivitySchema = z.enum(["busy", "idle", "retry"]);
export type SessionActivity = z.infer<typeof sessionActivitySchema>;

export const pendingSessionInputSchema = z.enum(["permission", "question"]);
export type PendingSessionInput = z.infer<typeof pendingSessionInputSchema>;

export const inventorySessionControlsSchema = z.object({
  status: z.literal("inventory"),
});
export type InventorySessionControls = Readonly<
  z.infer<typeof inventorySessionControlsSchema>
>;

export const readySessionControlsSchema = z.object({
  agent: z.string().min(1).optional(),
  model: modelReferenceSchema.optional(),
  status: z.literal("ready"),
});
export type ReadySessionControls = Readonly<
  z.infer<typeof readySessionControlsSchema>
>;

const sessionSummaryBaseSchema = z.object({
  activity: sessionActivitySchema,
  harnessId: harnessIdSchema,
  id: z.string().min(1),
  native: z.unknown(),
  pendingInput: pendingSessionInputSchema.optional(),
  projectId: z.string().min(1),
  title: z.string().min(1),
  updatedAt: z.string().datetime({ offset: true }).optional(),
});

export const inventorySessionSummarySchema = sessionSummaryBaseSchema.extend({
  controls: inventorySessionControlsSchema,
});
export type InventorySessionSummary = Readonly<
  z.infer<typeof inventorySessionSummarySchema>
>;

export const readySessionSummarySchema = sessionSummaryBaseSchema.extend({
  controls: readySessionControlsSchema,
});
export type ReadySessionSummary = Readonly<
  z.infer<typeof readySessionSummarySchema>
>;

export const sessionSummarySchema = z.union([
  inventorySessionSummarySchema,
  readySessionSummarySchema,
]);
export type SessionSummary = Readonly<z.infer<typeof sessionSummarySchema>>;

export interface SessionBootstrap {
  readonly session: ReadySessionSummary;
  readonly timeline: TimelinePage;
}

export interface SessionControlStore {
  readonly delete: (providerId: string, sessionId: string) => void;
  readonly read: (
    providerId: string,
    sessionId: string
  ) => ReadySessionControls | undefined;
  readonly write: (
    providerId: string,
    sessionId: string,
    controls: ReadySessionControls
  ) => void;
}

export const serviceCategorySchema = z.enum(["lsp", "mcp", "plugin"]);
export type ServiceCategory = z.infer<typeof serviceCategorySchema>;

export const serviceStateSchema = z.enum([
  "attention",
  "disabled",
  "error",
  "ready",
]);
export type ServiceState = z.infer<typeof serviceStateSchema>;

export const serviceSummarySchema = z.object({
  category: serviceCategorySchema,
  detail: z.string().min(1).optional(),
  id: z.string().min(1),
  label: z.string().min(1),
  state: serviceStateSchema,
});
export type ServiceSummary = Readonly<z.infer<typeof serviceSummarySchema>>;

export interface CreateSessionInput {
  readonly projectId: string;
}

export interface SendTurnInput {
  readonly sessionId: string;
  readonly text: string;
}

export interface RenameSessionInput {
  readonly sessionId: string;
  readonly title: string;
}

export interface ArchiveSessionInput {
  readonly sessionId: string;
}

export interface ListFilesInput {
  readonly path: string;
  readonly projectId: string;
}

export interface ReadFileInput {
  readonly path: string;
  readonly projectId: string;
}

export interface SelectModelInput extends ModelReference {
  readonly sessionId: string;
}

export interface SelectAgentInput {
  readonly agentId: string;
  readonly sessionId: string;
}

export interface HarnessAdapter {
  readonly abortTurn: (sessionId: string) => Promise<void>;
  readonly archiveSession: (input: ArchiveSessionInput) => Promise<void>;
  readonly bootstrapSession: (sessionId: string) => Promise<SessionBootstrap>;
  readonly createSession: (
    input: CreateSessionInput
  ) => Promise<SessionSummary>;
  readonly health: () => Promise<{
    readonly healthy: boolean;
    readonly version?: string;
  }>;
  readonly listCatalog: (projectId: string) => Promise<ProviderCatalog>;
  readonly listFileChanges: (
    projectId: string
  ) => Promise<readonly WorkspaceFileChange[]>;
  readonly listFiles: (
    input: ListFilesInput
  ) => Promise<readonly WorkspaceFileNode[]>;
  readonly listInteractions: (
    sessionId: string
  ) => Promise<readonly PendingInteraction[]>;
  readonly listProjects: () => Promise<readonly ProjectSummary[]>;
  readonly listServices: (
    projectId: string
  ) => Promise<readonly ServiceSummary[]>;
  readonly listSessions: (
    projectId?: string
  ) => Promise<readonly SessionSummary[]>;
  readonly listTimeline: (
    sessionId: string,
    olderCursor?: string
  ) => Promise<TimelinePage>;
  readonly manifest: ProviderManifest;
  readonly readFile: (input: ReadFileInput) => Promise<WorkspaceFileContent>;
  readonly renameSession: (
    input: RenameSessionInput
  ) => Promise<SessionSummary>;
  readonly respondPermission: (input: RespondPermissionInput) => Promise<void>;
  readonly respondQuestion: (input: RespondQuestionInput) => Promise<void>;
  readonly selectAgent: (input: SelectAgentInput) => Promise<SessionSummary>;
  readonly selectModel: (input: SelectModelInput) => Promise<SessionSummary>;
  readonly sendTurn: (input: SendTurnInput) => Promise<void>;
  readonly subscribe: (
    sessionId: string,
    signal?: AbortSignal,
    afterCursor?: string
  ) => AsyncIterable<ProviderEvent>;
}
