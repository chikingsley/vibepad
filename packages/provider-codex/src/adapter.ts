import { isAbsolute, resolve, sep } from "node:path";
import type { ProviderCatalog } from "@vibepad/protocol/catalog";
import type {
  ProviderEvent,
  ProviderEventStore,
} from "@vibepad/protocol/events";
import type {
  WorkspaceFileChange,
  WorkspaceFileContent,
  WorkspaceFileNode,
} from "@vibepad/protocol/files";
import type {
  PendingInteraction,
  RespondPermissionInput,
  RespondQuestionInput,
} from "@vibepad/protocol/interactions";
import type {
  ArchiveSessionInput,
  CreateSessionInput,
  HarnessAdapter,
  ListFilesInput,
  PendingSessionInput,
  ProjectSummary,
  ReadFileInput,
  ReadySessionControls,
  RenameSessionInput,
  SelectAgentInput,
  SelectModelInput,
  SendTurnInput,
  ServiceSummary,
  SessionBootstrap,
  SessionControlStore,
  SessionSummary,
} from "@vibepad/protocol/provider";
import { readySessionSummarySchema } from "@vibepad/protocol/provider";
import type { TimelinePage } from "@vibepad/protocol/timeline";

import type { GitDiffToRemoteResponse } from "../generated/GitDiffToRemoteResponse";
import type { CollaborationModeListResponse } from "../generated/v2/CollaborationModeListResponse";
import type { CurrentTimeReadResponse } from "../generated/v2/CurrentTimeReadResponse";
import type { FsReadDirectoryResponse } from "../generated/v2/FsReadDirectoryResponse";
import type { FsReadFileResponse } from "../generated/v2/FsReadFileResponse";
import type { GetAccountResponse } from "../generated/v2/GetAccountResponse";
import type { ListMcpServerStatusResponse } from "../generated/v2/ListMcpServerStatusResponse";
import type { Model } from "../generated/v2/Model";
import type { ModelListResponse } from "../generated/v2/ModelListResponse";
import type { SkillsListResponse } from "../generated/v2/SkillsListResponse";
import type { Thread } from "../generated/v2/Thread";
import type { ThreadItem } from "../generated/v2/ThreadItem";
import type { ThreadListResponse } from "../generated/v2/ThreadListResponse";
import type { ThreadReadResponse } from "../generated/v2/ThreadReadResponse";
import type { ThreadResumeResponse } from "../generated/v2/ThreadResumeResponse";
import type { ThreadStartResponse } from "../generated/v2/ThreadStartResponse";
import type { ThreadTurnsListResponse } from "../generated/v2/ThreadTurnsListResponse";
import type { Turn } from "../generated/v2/Turn";
import type { TurnStartResponse } from "../generated/v2/TurnStartResponse";
import {
  CodexAppServerClient,
  type CodexAppServerClientOptions,
  type CodexConnectionState,
  type CodexServerNotification,
  type CodexServerRequest,
} from "./app-server-client";
import { parseUnifiedDiff } from "./diff";
import { CodexEventHub } from "./event-hub";
import {
  codexProjectId,
  codexProjectName,
  codexProjectPath,
  codexSessionId,
  codexThreadId,
} from "./ids";
import {
  type PendingCodexInteraction,
  permissionResponse,
  projectCodexInteraction,
  questionResponse,
} from "./interactions";
import { codexManifest } from "./manifest";
import { type CodexSessionState, mapCodexSession } from "./sessions";
import { mapCodexTurns } from "./timeline";
import { mergeCodexTurn } from "./turn-reconciliation";

const codexTurnPageSize = 3;
const defaultInterruptGraceMs = 3000;

export interface CodexAdapterOptions extends CodexAppServerClientOptions {
  readonly client?: CodexAppServerClient;
  readonly eventStore?: ProviderEventStore;
  readonly interruptGraceMs?: number;
  readonly projectRoots?: readonly string[];
  readonly sessionControlStore?: SessionControlStore;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const property = (record: Record<string, unknown>, key: string): unknown =>
  Reflect.get(record, key);

const trailingSlash = /\/$/u;
const sessionUpdateNotifications = new Set([
  "thread/archived",
  "thread/closed",
  "thread/deleted",
  "thread/name/updated",
  "thread/status/changed",
]);
const terminalThreadNotifications = new Set([
  "thread/archived",
  "thread/closed",
  "thread/deleted",
]);
const timelineNotificationPrefixes = ["item/", "turn/diff/", "turn/plan/"];

const isTimelineNotification = (method: string) =>
  timelineNotificationPrefixes.some((prefix) => method.startsWith(prefix));

const nativeThreadId = (params: unknown) => {
  if (!isRecord(params)) {
    return;
  }
  const threadId = property(params, "threadId");
  if (typeof threadId === "string") {
    return threadId;
  }
  const thread = property(params, "thread");
  const nestedThreadId = isRecord(thread) ? property(thread, "id") : undefined;
  return typeof nestedThreadId === "string" ? nestedThreadId : undefined;
};

const nativeTurnId = (params: unknown) => {
  if (!isRecord(params)) {
    return;
  }
  const turnId = property(params, "turnId");
  if (typeof turnId === "string") {
    return turnId;
  }
  const turn = property(params, "turn");
  const nestedTurnId = isRecord(turn) ? property(turn, "id") : undefined;
  if (typeof nestedTurnId === "string") {
    return nestedTurnId;
  }
};

const threadStatusIsIdle = (params: unknown) => {
  if (!isRecord(params)) {
    return false;
  }
  const status = property(params, "status");
  return isRecord(status) && property(status, "type") === "idle";
};

const isFinalAgentMessage = (params: unknown) => {
  if (!isRecord(params)) {
    return false;
  }
  const item = property(params, "item");
  return (
    isRecord(item) &&
    property(item, "type") === "agentMessage" &&
    property(item, "phase") === "final_answer"
  );
};

const pendingType = (
  pending: Iterable<PendingCodexInteraction>,
  sessionId: string
): PendingSessionInput | undefined => {
  let question = false;
  for (const item of pending) {
    if (item.interaction.sessionId !== sessionId) {
      continue;
    }
    if (item.interaction.kind === "permission") {
      return "permission";
    }
    question = true;
  }
  return question ? "question" : undefined;
};

const likelyIgnored = (name: string) =>
  name === ".git" ||
  name === ".expo" ||
  name === ".next" ||
  name === ".turbo" ||
  name === "dist" ||
  name === "node_modules";

const mimeForPath = (path: string) => {
  const extension = path.split(".").at(-1)?.toLowerCase();
  const types: Readonly<Record<string, string>> = {
    gif: "image/gif",
    jpeg: "image/jpeg",
    jpg: "image/jpeg",
    json: "application/json",
    md: "text/markdown",
    pdf: "application/pdf",
    png: "image/png",
    svg: "image/svg+xml",
    ts: "text/typescript",
    tsx: "text/typescript",
    txt: "text/plain",
    webp: "image/webp",
  };
  return extension ? types[extension] : undefined;
};

export class CodexAdapter implements HarnessAdapter {
  readonly manifest = codexManifest;
  readonly #activeTurns = new Map<string, string>();
  readonly #client: CodexAppServerClient;
  readonly #configuredRoots: readonly string[];
  readonly #eventHub: CodexEventHub;
  readonly #freshThreadGenerations = new Map<string, number>();
  readonly #freshThreads = new Map<string, Thread>();
  readonly #initialTimelinePages = new Map<string, ThreadTurnsListResponse>();
  readonly #interruptGraceMs: number;
  readonly #loadedThreads = new Set<string>();
  readonly #pending = new Map<string, PendingCodexInteraction>();
  readonly #richTurns = new Map<string, Map<string, Turn>>();
  readonly #sessionControlStore: SessionControlStore | undefined;
  readonly #sessionState = new Map<string, CodexSessionState>();
  readonly #settledTurns = new Map<string, string>();
  readonly #threadProjects = new Map<string, string>();
  readonly #turnSettlementWaiters = new Map<string, Set<() => void>>();
  readonly #unsubscribeConnection: () => void;
  readonly #unsubscribeNotification: () => void;
  readonly #unsubscribeRequest: () => void;

  constructor(options: CodexAdapterOptions = {}) {
    this.#eventHub = new CodexEventHub(options.eventStore);
    this.#client =
      options.client ??
      new CodexAppServerClient({
        ...(options.command ? { command: options.command } : {}),
        ...(options.cwd ? { cwd: options.cwd } : {}),
        ...(options.env ? { env: options.env } : {}),
        ...(options.requestTimeoutMs
          ? { requestTimeoutMs: options.requestTimeoutMs }
          : {}),
      });
    this.#configuredRoots = [
      ...new Set(
        (options.projectRoots ?? [options.cwd ?? process.cwd()]).map((path) =>
          resolve(path)
        )
      ),
    ];
    this.#interruptGraceMs =
      options.interruptGraceMs ?? defaultInterruptGraceMs;
    this.#sessionControlStore = options.sessionControlStore;
    this.#unsubscribeNotification = this.#client.onNotification(
      (notification) => {
        this.#handleNotification(notification);
      }
    );
    this.#unsubscribeRequest = this.#client.onRequest((request) => {
      this.#handleRequest(request).catch(() => undefined);
    });
    this.#unsubscribeConnection = this.#client.onConnectionState((state) => {
      this.#handleConnectionState(state);
    });
  }

  async dispose(): Promise<void> {
    this.#unsubscribeConnection();
    this.#unsubscribeNotification();
    this.#unsubscribeRequest();
    await this.#client.dispose();
  }

  async health() {
    const initialized = await this.#start();
    const account = await this.#query<GetAccountResponse>("account/read", {});
    return {
      healthy: Boolean(account.account) || !account.requiresOpenaiAuth,
      version: initialized.userAgent,
    };
  }

  async listProjects(): Promise<readonly ProjectSummary[]> {
    const threads = await this.#listThreads();
    const roots = new Map<string, number>(
      this.#configuredRoots.map((path) => [path, 0])
    );
    for (const thread of threads) {
      if (thread.parentThreadId || thread.ephemeral) {
        continue;
      }
      roots.set(thread.cwd, (roots.get(thread.cwd) ?? 0) + 1);
      this.#threadProjects.set(thread.id, codexProjectId(thread.cwd));
    }
    return [...roots.entries()]
      .map(([path, threadCount]) => ({
        harnessId: "codex" as const,
        id: codexProjectId(path),
        name: codexProjectName(path),
        native: { path, threadCount },
        path,
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  async listSessions(projectId?: string): Promise<readonly SessionSummary[]> {
    const cwd = projectId ? codexProjectPath(projectId) : undefined;
    const persistedThreads = await this.#listThreads(cwd);
    const threads = new Map(
      persistedThreads.map((thread) => [thread.id, thread] as const)
    );
    const generation = this.#client.connectionGeneration;
    for (const [threadId, thread] of this.#freshThreads) {
      if (
        generation !== undefined &&
        this.#freshThreadGenerations.get(threadId) === generation &&
        (!cwd || thread.cwd === cwd) &&
        !threads.has(threadId)
      ) {
        threads.set(threadId, thread);
      }
    }
    return [...threads.values()]
      .filter((thread) => !(thread.parentThreadId || thread.ephemeral))
      .sort(
        (left, right) =>
          (right.recencyAt ?? right.updatedAt) -
          (left.recencyAt ?? left.updatedAt)
      )
      .map((thread) => {
        const publicSessionId = codexSessionId(thread.id);
        this.#threadProjects.set(thread.id, codexProjectId(thread.cwd));
        return mapCodexSession(
          thread,
          this.#sessionStateFor(thread.id),
          pendingType(this.#pending.values(), publicSessionId)
        );
      });
  }

  async createSession(input: CreateSessionInput): Promise<SessionSummary> {
    const cwd = codexProjectPath(input.projectId);
    const result = await this.#client.request<ThreadStartResponse>(
      "thread/start",
      { cwd }
    );
    const generation = this.#client.connectionGeneration;
    if (generation !== undefined) {
      this.#freshThreadGenerations.set(result.thread.id, generation);
    }
    this.#freshThreads.set(result.thread.id, result.thread);
    this.#loadedThreads.add(result.thread.id);
    this.#threadProjects.set(result.thread.id, input.projectId);
    this.#writeSessionState(result.thread.id, {
      agent: "default",
      model: {
        id: result.model,
        providerId: result.modelProvider,
        ...(result.reasoningEffort ? { variant: result.reasoningEffort } : {}),
      },
    });
    return mapCodexSession(
      result.thread,
      this.#sessionStateFor(result.thread.id)
    );
  }

  async archiveSession(input: ArchiveSessionInput): Promise<void> {
    const threadId = codexThreadId(input.sessionId);
    await this.#client.request("thread/archive", {
      threadId,
    });
    this.#freshThreadGenerations.delete(threadId);
    this.#freshThreads.delete(threadId);
    this.#initialTimelinePages.delete(threadId);
    this.#sessionState.delete(threadId);
    this.#sessionControlStore?.delete("codex", input.sessionId);
  }

  async renameSession(input: RenameSessionInput): Promise<SessionSummary> {
    const threadId = codexThreadId(input.sessionId);
    await this.#client.request("thread/name/set", {
      name: input.title,
      threadId,
    });
    return this.#readSession(threadId);
  }

  async listTimeline(
    sessionId: string,
    olderCursor?: string
  ): Promise<TimelinePage> {
    const threadId = codexThreadId(sessionId);
    try {
      await this.#ensureLoaded(threadId);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes(
          "was not materialized before the app-server disconnected"
        )
      ) {
        return { items: [] };
      }
      throw error;
    }
    let result = olderCursor
      ? undefined
      : this.#initialTimelinePages.get(threadId);
    this.#initialTimelinePages.delete(threadId);
    if (!result) {
      try {
        result = await this.#query<ThreadTurnsListResponse>(
          "thread/turns/list",
          {
            ...(olderCursor ? { cursor: olderCursor } : {}),
            itemsView: "full",
            limit: codexTurnPageSize,
            sortDirection: "desc",
            threadId,
          }
        );
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes("is not materialized yet")
        ) {
          return { items: [] };
        }
        throw error;
      }
    }
    const richTurns = this.#richTurns.get(threadId);
    const turns = result.data.map((turn) => {
      const persisted = richTurns?.get(turn.id);
      return persisted ? mergeCodexTurn(turn, persisted) : turn;
    });
    return {
      items: mapCodexTurns(threadId, turns.reverse()),
      ...(result.nextCursor ? { olderCursor: result.nextCursor } : {}),
    };
  }

  async bootstrapSession(sessionId: string): Promise<SessionBootstrap> {
    const threadId = codexThreadId(sessionId);
    await this.#ensureLoaded(threadId);
    const [session, timeline] = await Promise.all([
      this.#readSession(threadId),
      this.listTimeline(sessionId),
    ]);
    return {
      session: readySessionSummarySchema.parse(session),
      timeline,
    };
  }

  async sendTurn(input: SendTurnInput): Promise<void> {
    const threadId = codexThreadId(input.sessionId);
    await this.#ensureLoaded(threadId);
    const result = await this.#client.request<TurnStartResponse>("turn/start", {
      input: [{ text: input.text, text_elements: [], type: "text" }],
      threadId,
    });
    this.#activeTurns.set(threadId, result.turn.id);
  }

  async abortTurn(sessionId: string): Promise<void> {
    const threadId = codexThreadId(sessionId);
    const turnId =
      this.#activeTurns.get(threadId) ?? (await this.#activeTurn(threadId));
    if (!turnId) {
      throw new Error(`Codex thread has no active turn: ${threadId}`);
    }
    // Track the turn (it may have been discovered via thread/turns/list) so
    // the completion signals — real turn/completed or the idle/final_answer
    // fallbacks — settle it instead of an optimistic delete.
    this.#activeTurns.set(threadId, turnId);
    const settlement = this.#awaitTurnSettlement(
      threadId,
      this.#interruptGraceMs
    );
    await this.#client.request("turn/interrupt", { threadId, turnId });
    if (await settlement) {
      return;
    }
    throw new Error(
      `Codex turn ${turnId} on thread ${threadId} did not stop within ${this.#interruptGraceMs}ms of turn/interrupt; the turn may still be running`
    );
  }

  async listCatalog(projectId: string): Promise<ProviderCatalog> {
    const cwd = codexProjectPath(projectId);
    const [models, skills, modes] = await Promise.all([
      this.#listModels(),
      this.#query<SkillsListResponse>("skills/list", {
        cwds: [cwd],
      }),
      this.#query<CollaborationModeListResponse>("collaborationMode/list", {}),
    ]);
    return {
      agents: modes.data.map((mode) => ({
        description: `${mode.name} collaboration mode`,
        hidden: false,
        id: mode.mode ?? mode.name.toLowerCase(),
        mode: "primary",
        native: mode,
      })),
      commands: [],
      models: models.map((model) => ({
        enabled: !model.hidden,
        id: model.model,
        name: model.displayName,
        native: model,
        providerId: "openai",
        status: "active",
        variants: model.supportedReasoningEfforts.map(
          (effort) => effort.reasoningEffort
        ),
      })),
      providers: [
        {
          disabled: false,
          id: "openai",
          name: "OpenAI",
          native: { id: "openai" },
        },
      ],
      skills: skills.data.flatMap((entry) =>
        entry.skills.map((skill) => ({
          description: skill.description,
          location: skill.path,
          name: skill.name,
          native: skill,
        }))
      ),
    };
  }

  async selectModel(input: SelectModelInput): Promise<SessionSummary> {
    const threadId = codexThreadId(input.sessionId);
    await this.#ensureLoaded(threadId);
    const models = await this.#listModels();
    const model = models.find(
      (candidate) => candidate.id === input.id || candidate.model === input.id
    );
    const effort = input.variant ?? model?.defaultReasoningEffort;
    await this.#client.request("thread/settings/update", {
      ...(effort ? { effort } : {}),
      model: input.id,
      threadId,
    });
    this.#writeSessionState(threadId, {
      ...this.#sessionStateFor(threadId),
      model: {
        id: input.id,
        providerId: input.providerId,
        ...(effort ? { variant: effort } : {}),
      },
    });
    return this.#readSession(threadId);
  }

  async selectAgent(input: SelectAgentInput): Promise<SessionSummary> {
    const threadId = codexThreadId(input.sessionId);
    await this.#ensureLoaded(threadId);
    const modes = await this.#query<CollaborationModeListResponse>(
      "collaborationMode/list",
      {}
    );
    const selected = modes.data.find(
      (mode) => (mode.mode ?? mode.name.toLowerCase()) === input.agentId
    );
    if (!selected?.mode) {
      throw new Error(`Codex collaboration mode not found: ${input.agentId}`);
    }
    const state = this.#sessionStateFor(threadId);
    const model =
      selected.model ?? state?.model?.id ?? (await this.#defaultModel());
    const reasoningEffort =
      selected.reasoning_effort ?? state?.model?.variant ?? null;
    await this.#client.request("thread/settings/update", {
      collaborationMode: {
        mode: selected.mode,
        settings: {
          developer_instructions: null,
          model,
          reasoning_effort: reasoningEffort,
        },
      },
      threadId,
    });
    this.#writeSessionState(threadId, {
      ...state,
      agent: input.agentId,
      ...(state?.model
        ? {
            model: {
              ...state.model,
              ...(reasoningEffort ? { variant: reasoningEffort } : {}),
            },
          }
        : {}),
    });
    return this.#readSession(threadId);
  }

  listInteractions(sessionId: string): Promise<readonly PendingInteraction[]> {
    return Promise.resolve(
      [...this.#pending.values()]
        .map((pending) => pending.interaction)
        .filter((interaction) => interaction.sessionId === sessionId)
    );
  }

  async respondPermission(input: RespondPermissionInput): Promise<void> {
    const pending = this.#pending.get(input.requestId);
    if (!(pending && pending.interaction.kind === "permission")) {
      throw new Error(`Codex permission request not found: ${input.requestId}`);
    }
    await this.#client.respond(
      pending.request.id,
      permissionResponse(pending, input.decision),
      pending.request.connectionGeneration
    );
    this.#resolveInteraction(input.requestId, "permission.resolved");
  }

  async respondQuestion(input: RespondQuestionInput): Promise<void> {
    const pending = this.#pending.get(input.requestId);
    if (!(pending && pending.interaction.kind === "question")) {
      throw new Error(`Codex question request not found: ${input.requestId}`);
    }
    await this.#client.respond(
      pending.request.id,
      questionResponse(pending, input),
      pending.request.connectionGeneration
    );
    this.#resolveInteraction(input.requestId, "question.resolved");
  }

  async listFiles(
    input: ListFilesInput
  ): Promise<readonly WorkspaceFileNode[]> {
    const absolute = this.#projectFilePath(input.projectId, input.path);
    const result = await this.#query<FsReadDirectoryResponse>(
      "fs/readDirectory",
      { path: absolute }
    );
    return result.entries.flatMap((entry) => {
      if (!(entry.isDirectory || entry.isFile)) {
        return [];
      }
      const path = [input.path.replace(trailingSlash, ""), entry.fileName]
        .filter(Boolean)
        .join("/");
      return [
        {
          ignored: likelyIgnored(entry.fileName),
          name: entry.fileName,
          path,
          type: entry.isDirectory ? "directory" : "file",
        },
      ];
    });
  }

  async readFile(input: ReadFileInput): Promise<WorkspaceFileContent> {
    const absolute = this.#projectFilePath(input.projectId, input.path);
    const result = await this.#query<FsReadFileResponse>("fs/readFile", {
      path: absolute,
    });
    const bytes = Buffer.from(result.dataBase64, "base64");
    const mimeType = mimeForPath(input.path);
    if (bytes.includes(0)) {
      return {
        content: result.dataBase64,
        encoding: "base64",
        ...(mimeType ? { mimeType } : {}),
        type: "binary",
      };
    }
    return {
      content: bytes.toString("utf8"),
      ...(mimeType ? { mimeType } : {}),
      type: "text",
    };
  }

  async listFileChanges(
    projectId: string
  ): Promise<readonly WorkspaceFileChange[]> {
    const result = await this.#query<GitDiffToRemoteResponse>(
      "gitDiffToRemote",
      { cwd: codexProjectPath(projectId) }
    );
    return parseUnifiedDiff(result.diff);
  }

  async listServices(_projectId: string): Promise<readonly ServiceSummary[]> {
    const result = await this.#query<ListMcpServerStatusResponse>(
      "mcpServerStatus/list",
      {}
    );
    return result.data.map((server) => {
      let state: ServiceSummary["state"] = "error";
      if (server.authStatus === "notLoggedIn") {
        state = "attention";
      } else if (server.serverInfo) {
        state = "ready";
      }
      return {
        category: "mcp",
        detail: `${Object.keys(server.tools).length} tools`,
        id: `mcp:${server.name}`,
        label: server.serverInfo?.title ?? server.name,
        state,
      };
    });
  }

  async *subscribe(
    sessionId: string,
    signal?: AbortSignal,
    afterCursor?: string
  ): AsyncIterable<ProviderEvent> {
    const threadId = codexThreadId(sessionId);
    await this.#ensureLoaded(threadId);
    yield* this.#eventHub.subscribe(sessionId, signal, afterCursor);
  }

  #start() {
    return this.#client.start();
  }

  #query<Result>(method: string, params: unknown): Promise<Result> {
    return this.#client.request<Result>(method, params, {
      retryOnDisconnect: true,
    });
  }

  async #listThreads(cwd?: string): Promise<readonly Thread[]> {
    await this.#start();
    const threads: Thread[] = [];
    let cursor: string | null = null;
    do {
      const result: ThreadListResponse =
        // biome-ignore lint/performance/noAwaitInLoops: Codex thread pages are cursor-dependent.
        await this.#query<ThreadListResponse>("thread/list", {
          archived: false,
          ...(cursor ? { cursor } : {}),
          ...(cwd ? { cwd } : {}),
          limit: 200,
          sortDirection: "desc",
          sortKey: "updated_at",
        });
      threads.push(...result.data);
      cursor = result.nextCursor;
    } while (cursor);
    return threads;
  }

  async #listModels(): Promise<readonly Model[]> {
    const models: Model[] = [];
    let cursor: string | null = null;
    do {
      const result: ModelListResponse =
        // biome-ignore lint/performance/noAwaitInLoops: Codex model pages are cursor-dependent.
        await this.#query<ModelListResponse>("model/list", {
          ...(cursor ? { cursor } : {}),
          includeHidden: true,
          limit: 200,
        });
      models.push(...result.data);
      cursor = result.nextCursor;
    } while (cursor);
    return models;
  }

  async #defaultModel() {
    const models = await this.#listModels();
    return (
      models.find((model) => model.isDefault)?.model ?? models[0]?.model ?? ""
    );
  }

  #sessionStateFor(threadId: string): CodexSessionState | undefined {
    const current = this.#sessionState.get(threadId);
    if (current) {
      return current;
    }
    const controls = this.#sessionControlStore?.read(
      "codex",
      codexSessionId(threadId)
    );
    if (!controls) {
      return;
    }
    const restored: CodexSessionState = {
      ...(controls.agent ? { agent: controls.agent } : {}),
      ...(controls.model ? { model: controls.model } : {}),
    };
    this.#sessionState.set(threadId, restored);
    return restored;
  }

  #writeSessionState(threadId: string, state: CodexSessionState): void {
    this.#sessionState.set(threadId, state);
    const controls: ReadySessionControls = {
      ...(state.agent ? { agent: state.agent } : {}),
      ...(state.model ? { model: state.model } : {}),
      status: "ready",
    };
    this.#sessionControlStore?.write(
      "codex",
      codexSessionId(threadId),
      controls
    );
  }

  async #ensureLoaded(threadId: string): Promise<void> {
    if (this.#loadedThreads.has(threadId)) {
      return;
    }
    let result: ThreadResumeResponse;
    try {
      result = await this.#query<ThreadResumeResponse>("thread/resume", {
        excludeTurns: true,
        initialTurnsPage: {
          itemsView: "full",
          limit: codexTurnPageSize,
          sortDirection: "desc",
        },
        threadId,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("no rollout found for thread id")
      ) {
        const generation = this.#client.connectionGeneration;
        if (
          generation !== undefined &&
          this.#freshThreadGenerations.get(threadId) === generation
        ) {
          // `thread/start` can resolve just before its `thread/started`
          // notification is delivered. The fresh in-memory thread is valid on
          // the same app-server connection even without a rollout entry.
          this.#loadedThreads.add(threadId);
          return;
        }
        throw new Error(
          `Codex thread ${threadId} was not materialized before the app-server disconnected; create a new session and resend the draft`,
          { cause: error }
        );
      }
      throw error;
    }
    this.#freshThreadGenerations.delete(threadId);
    this.#freshThreads.delete(threadId);
    this.#loadedThreads.add(threadId);
    if (result.initialTurnsPage) {
      this.#initialTimelinePages.set(threadId, result.initialTurnsPage);
    }
    const initialTurns = result.initialTurnsPage?.data ?? result.thread.turns;
    this.#richTurns.set(
      threadId,
      new Map(initialTurns.map((turn) => [turn.id, turn]))
    );
    this.#restorePersistedTimeline(threadId);
    this.#threadProjects.set(threadId, codexProjectId(result.cwd));
    this.#writeSessionState(threadId, {
      ...this.#sessionStateFor(threadId),
      model: {
        id: result.model,
        providerId: result.modelProvider,
        ...(result.reasoningEffort ? { variant: result.reasoningEffort } : {}),
      },
    });
  }

  async #readSession(threadId: string): Promise<SessionSummary> {
    const result = await this.#query<ThreadReadResponse>("thread/read", {
      includeTurns: false,
      threadId,
    });
    if (this.#freshThreads.has(threadId)) {
      this.#freshThreads.set(threadId, result.thread);
    }
    this.#threadProjects.set(threadId, codexProjectId(result.thread.cwd));
    return mapCodexSession(
      result.thread,
      this.#sessionStateFor(threadId),
      pendingType(this.#pending.values(), codexSessionId(threadId))
    );
  }

  async #activeTurn(threadId: string) {
    const result = await this.#query<ThreadTurnsListResponse>(
      "thread/turns/list",
      {
        itemsView: "notLoaded",
        limit: 5,
        sortDirection: "desc",
        threadId,
      }
    );
    return result.data.find((turn) => turn.status === "inProgress")?.id;
  }

  #projectFilePath(projectId: string, path: string) {
    const root = resolve(codexProjectPath(projectId));
    const candidate = resolve(root, path);
    if (
      !isAbsolute(candidate) ||
      (candidate !== root && !candidate.startsWith(`${root}${sep}`))
    ) {
      throw new Error(`File path escapes Codex project: ${path}`);
    }
    return candidate;
  }

  async #handleRequest(request: CodexServerRequest) {
    if (request.method === "currentTime/read") {
      const response: CurrentTimeReadResponse = {
        currentTimeAt: Math.floor(Date.now() / 1000),
      };
      await this.#client.respond(
        request.id,
        response,
        request.connectionGeneration
      );
      return;
    }
    const pending = projectCodexInteraction(request);
    if (!pending) {
      await this.#client.respondError(
        request.id,
        -32_601,
        `VibePad does not implement Codex server request ${request.method}`,
        request.connectionGeneration
      );
      return;
    }
    const id = String(request.id);
    this.#pending.set(id, pending);
    const threadId = codexThreadId(pending.interaction.sessionId);
    this.#emit(
      threadId,
      pending.interaction.kind === "permission"
        ? "permission.requested"
        : "question.requested",
      request
    );
  }

  #handleConnectionState(state: CodexConnectionState) {
    if (state.kind !== "disconnected") {
      return;
    }
    this.#activeTurns.clear();
    this.#freshThreads.clear();
    this.#initialTimelinePages.clear();
    this.#loadedThreads.clear();
    this.#pending.clear();
    this.#richTurns.clear();
    this.#sessionState.clear();
    this.#settledTurns.clear();
    for (const threadId of [...this.#turnSettlementWaiters.keys()]) {
      // The app-server child is gone, so no turn is running anymore.
      this.#settleTurnWaiters(threadId);
    }
  }

  #synthesizeTurnCompletion(threadId: string, source: string, turnId?: string) {
    const activeTurnId = this.#activeTurns.get(threadId);
    if (!activeTurnId || (turnId && turnId !== activeTurnId)) {
      return;
    }
    this.#activeTurns.delete(threadId);
    this.#freshThreadGenerations.delete(threadId);
    this.#freshThreads.delete(threadId);
    this.#settledTurns.set(threadId, activeTurnId);
    const cached = this.#richTurns.get(threadId)?.get(activeTurnId);
    const turn: Turn = {
      completedAt: cached?.completedAt ?? null,
      durationMs: cached?.durationMs ?? null,
      error: cached?.error ?? null,
      id: activeTurnId,
      items: cached?.items ?? [],
      itemsView: "full",
      startedAt: cached?.startedAt ?? null,
      status: "completed",
    };
    const params = { threadId, turn };
    this.#rememberNotificationTurn(threadId, params);
    this.#emit(threadId, "turn.completed", {
      method: "turn/completed",
      params,
      synthesizedFrom: source,
    });
    this.#settleTurnWaiters(threadId);
  }

  #settleTurnWaiters(threadId: string) {
    const waiters = this.#turnSettlementWaiters.get(threadId);
    if (!waiters) {
      return;
    }
    this.#turnSettlementWaiters.delete(threadId);
    for (const waiter of waiters) {
      waiter();
    }
  }

  #awaitTurnSettlement(threadId: string, timeoutMs: number): Promise<boolean> {
    if (!this.#activeTurns.has(threadId)) {
      return Promise.resolve(true);
    }
    return new Promise<boolean>((resolveSettlement) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const waiter = () => {
        if (timer !== undefined) {
          clearTimeout(timer);
        }
        resolveSettlement(true);
      };
      timer = setTimeout(() => {
        const waiters = this.#turnSettlementWaiters.get(threadId);
        waiters?.delete(waiter);
        if (waiters?.size === 0) {
          this.#turnSettlementWaiters.delete(threadId);
        }
        resolveSettlement(false);
      }, timeoutMs);
      const waiters =
        this.#turnSettlementWaiters.get(threadId) ?? new Set<() => void>();
      waiters.add(waiter);
      this.#turnSettlementWaiters.set(threadId, waiters);
    });
  }

  #handleNotification(notification: CodexServerNotification) {
    const threadId = nativeThreadId(notification.params);
    if (!threadId) {
      return;
    }
    if (notification.method === "thread/started") {
      this.#loadedThreads.add(threadId);
      if (isRecord(notification.params)) {
        const thread = property(notification.params, "thread");
        const cwd = isRecord(thread) ? property(thread, "cwd") : undefined;
        if (typeof cwd === "string") {
          this.#threadProjects.set(threadId, codexProjectId(cwd));
        }
      }
      this.#emit(threadId, "session.updated", notification);
      return;
    }
    const turnId = nativeTurnId(notification.params);
    if (notification.method === "turn/started") {
      this.#settledTurns.delete(threadId);
      if (turnId) {
        this.#activeTurns.set(threadId, turnId);
      }
      this.#rememberNotificationTurn(threadId, notification.params);
      this.#emit(threadId, "turn.started", notification);
      return;
    }
    if (notification.method === "turn/completed") {
      this.#handleTurnCompleted(threadId, turnId, notification);
      return;
    }
    if (
      notification.method === "thread/status/changed" &&
      threadStatusIsIdle(notification.params)
    ) {
      // Codex can skip turn/completed entirely for fast turns; an idle
      // thread status is the fallback completion signal for the active turn.
      this.#synthesizeTurnCompletion(threadId, "thread/status/changed");
    }
    if (this.#handleSessionNotification(threadId, notification)) {
      return;
    }
    if (isTimelineNotification(notification.method)) {
      this.#handleTimelineNotification(threadId, turnId, notification);
      return;
    }
    this.#emit(threadId, "provider.event", notification);
  }

  #handleTurnCompleted(
    threadId: string,
    turnId: string | undefined,
    notification: CodexServerNotification
  ) {
    if (turnId && this.#settledTurns.get(threadId) === turnId) {
      // A fallback signal already synthesized this turn's completion;
      // absorb the late real notification without double-firing.
      this.#settledTurns.delete(threadId);
      this.#rememberNotificationTurn(threadId, notification.params);
      return;
    }
    this.#activeTurns.delete(threadId);
    this.#freshThreadGenerations.delete(threadId);
    this.#freshThreads.delete(threadId);
    this.#rememberNotificationTurn(threadId, notification.params);
    this.#emit(threadId, "turn.completed", notification);
    this.#settleTurnWaiters(threadId);
  }

  #handleTimelineNotification(
    threadId: string,
    turnId: string | undefined,
    notification: CodexServerNotification
  ) {
    if (notification.method === "item/started") {
      this.#rememberNotificationItem(threadId, notification.params, false);
    } else if (notification.method === "item/completed") {
      this.#rememberNotificationItem(threadId, notification.params, true);
    }
    this.#emit(threadId, "timeline.item.upserted", notification);
    if (
      notification.method === "item/completed" &&
      isFinalAgentMessage(notification.params)
    ) {
      // A final_answer agent message ends the turn even when Codex skips
      // the turn/completed notification.
      this.#synthesizeTurnCompletion(
        threadId,
        "item/completed:final_answer",
        turnId
      );
    }
  }

  #handleSessionNotification(
    threadId: string,
    notification: CodexServerNotification
  ) {
    if (!sessionUpdateNotifications.has(notification.method)) {
      return false;
    }
    if (terminalThreadNotifications.has(notification.method)) {
      this.#freshThreadGenerations.delete(threadId);
      this.#freshThreads.delete(threadId);
    }
    this.#emit(threadId, "session.updated", notification);
    return true;
  }

  #resolveInteraction(
    requestId: string,
    kind: "permission.resolved" | "question.resolved"
  ) {
    const pending = this.#pending.get(requestId);
    if (!pending) {
      return;
    }
    this.#pending.delete(requestId);
    this.#emit(
      codexThreadId(pending.interaction.sessionId),
      kind,
      pending.request
    );
  }

  #rememberNotificationTurn(threadId: string, params: unknown) {
    if (!isRecord(params)) {
      return;
    }
    const turn = property(params, "turn");
    const turnId = isRecord(turn) ? property(turn, "id") : undefined;
    if (!(isRecord(turn) && typeof turnId === "string")) {
      return;
    }
    const incoming = turn as Turn;
    const turns = this.#richTurns.get(threadId) ?? new Map<string, Turn>();
    const current = turns.get(incoming.id);
    turns.set(incoming.id, {
      ...incoming,
      items:
        incoming.items.length > 0 ? incoming.items : (current?.items ?? []),
      itemsView: "full",
    });
    this.#richTurns.set(threadId, turns);
  }

  #rememberNotificationItem(
    threadId: string,
    params: unknown,
    completed: boolean
  ) {
    if (!isRecord(params)) {
      return;
    }
    const item = property(params, "item");
    const turnId = property(params, "turnId");
    if (
      !isRecord(item) ||
      typeof property(item, "type") !== "string" ||
      typeof turnId !== "string"
    ) {
      return;
    }
    const incoming = item as ThreadItem;
    const turns = this.#richTurns.get(threadId) ?? new Map<string, Turn>();
    const current = turns.get(turnId);
    const items = current?.items ?? [];
    const index = items.findIndex((candidate) => candidate.id === incoming.id);
    const nextItems =
      index >= 0
        ? items.map((candidate, candidateIndex) =>
            candidateIndex === index ? incoming : candidate
          )
        : [...items, incoming];
    const timestamp = params[completed ? "completedAtMs" : "startedAtMs"];
    const seconds = typeof timestamp === "number" ? timestamp / 1000 : null;
    turns.set(turnId, {
      completedAt: current?.completedAt ?? null,
      durationMs: current?.durationMs ?? null,
      error: current?.error ?? null,
      id: turnId,
      items: nextItems,
      itemsView: "full",
      startedAt: current?.startedAt ?? seconds,
      status: current?.status ?? "inProgress",
    });
    this.#richTurns.set(threadId, turns);
  }

  #restorePersistedTimeline(threadId: string) {
    const sessionId = codexSessionId(threadId);
    for (const event of this.#eventHub.persistedEvents(sessionId)) {
      if (!isRecord(event.native)) {
        continue;
      }
      const method = property(event.native, "method");
      const params = property(event.native, "params");
      if (method === "turn/started" || method === "turn/completed") {
        this.#rememberNotificationTurn(threadId, params);
      } else if (method === "item/started") {
        this.#rememberNotificationItem(threadId, params, false);
      } else if (method === "item/completed") {
        this.#rememberNotificationItem(threadId, params, true);
      }
    }
  }

  #emit(
    threadId: string,
    kind: Parameters<CodexEventHub["emit"]>[0]["kind"],
    native: unknown
  ) {
    this.#eventHub.emit({
      kind,
      native,
      projectId:
        this.#threadProjects.get(threadId) ??
        codexProjectId(this.#configuredRoots[0] ?? process.cwd()),
      sessionId: codexSessionId(threadId),
    });
  }
}
