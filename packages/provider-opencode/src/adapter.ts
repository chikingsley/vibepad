import { Buffer } from "node:buffer";
import {
  createOpencodeClient,
  type OpencodeClient,
} from "@opencode-ai/sdk/v2/client";
import type {
  McpStatus,
  PermissionV2Request,
  QuestionV2Request,
  SessionStatus,
  SessionV2Info,
} from "@opencode-ai/sdk/v2/types";
import type { ProviderCatalog } from "@vibepad/protocol/catalog";
import type { ProviderEvent } from "@vibepad/protocol/events";
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
  ReadySessionSummary,
  RenameSessionInput,
  SelectAgentInput,
  SelectModelInput,
  SendTurnInput,
  ServiceCategory,
  ServiceState,
  ServiceSummary,
  SessionActivity,
  SessionBootstrap,
  SessionSummary,
} from "@vibepad/protocol/provider";
import type { TimelinePage } from "@vibepad/protocol/timeline";

import {
  openCodeNativeSessionId,
  openCodeProjectId,
  openCodeSessionId,
} from "./ids";
import { openCodeManifest } from "./manifest";
import { mapLegacyTimelineMessage, mapTimelineMessage } from "./timeline";

export interface OpenCodeAdapterOptions {
  readonly baseUrl: string;
  readonly password?: string;
  readonly username?: string;
}

const mapSessionActivity = (
  status: SessionStatus | undefined
): SessionActivity => status?.type ?? "idle";

const mapSession = (
  session: SessionV2Info,
  status?: SessionStatus,
  projectId = openCodeProjectId(session.projectID),
  pendingInput?: PendingSessionInput
): ReadySessionSummary => ({
  activity: mapSessionActivity(status),
  controls: {
    ...(session.agent ? { agent: session.agent } : {}),
    ...(session.model
      ? {
          model: {
            id: session.model.id,
            providerId: session.model.providerID,
            ...(session.model.variant
              ? { variant: session.model.variant }
              : {}),
          },
        }
      : {}),
    status: "ready",
  },
  harnessId: "opencode",
  id: openCodeSessionId(session.id),
  native: session,
  ...(pendingInput ? { pendingInput } : {}),
  projectId,
  title: session.title,
  updatedAt: new Date(session.time.updated).toISOString(),
});

const resolveSessionProjectId = (
  session: SessionV2Info,
  projects: readonly ProjectSummary[]
) =>
  projects.find((project) => project.path === session.location.directory)?.id ??
  openCodeProjectId(session.projectID);

const pendingInputForSession = (
  sessionId: string,
  permissionSessionIds: ReadonlySet<string>,
  questionSessionIds: ReadonlySet<string>
): PendingSessionInput | undefined => {
  if (permissionSessionIds.has(sessionId)) {
    return "permission";
  }
  if (questionSessionIds.has(sessionId)) {
    return "question";
  }
};

const mapPermissionRequest = (
  request: PermissionV2Request
): PendingInteraction => ({
  action: request.action,
  id: request.id,
  kind: "permission",
  ...(request.metadata ? { metadata: request.metadata } : {}),
  native: request,
  resources: request.resources,
  save: request.save ?? [],
  sessionId: openCodeSessionId(request.sessionID),
});

const mapQuestionRequest = (
  request: QuestionV2Request
): PendingInteraction => ({
  id: request.id,
  kind: "question",
  native: request,
  questions: request.questions.map((question) => ({
    custom: question.custom ?? true,
    header: question.header,
    multiple: question.multiple ?? false,
    options: question.options,
    question: question.question,
  })),
  sessionId: openCodeSessionId(request.sessionID),
});

const mapEventKind = (event: RuntimeDurableEvent): ProviderEvent["kind"] => {
  const { type } = event;
  if (type === "permission.asked" || type === "permission.v2.asked") {
    return "permission.requested";
  }
  if (type === "permission.replied" || type === "permission.v2.replied") {
    return "permission.resolved";
  }
  if (type === "question.asked" || type === "question.v2.asked") {
    return "question.requested";
  }
  if (
    type === "question.replied" ||
    type === "question.rejected" ||
    type === "question.v2.replied" ||
    type === "question.v2.rejected"
  ) {
    return "question.resolved";
  }
  if (type === "message.removed" || type === "message.part.removed") {
    return "timeline.item.removed";
  }
  if (type.startsWith("message.")) {
    return "timeline.item.upserted";
  }
  if (
    type.startsWith("session.next.text.") ||
    type.startsWith("session.next.reasoning.") ||
    type.startsWith("session.next.tool.") ||
    type.startsWith("session.next.shell.") ||
    type.startsWith("session.next.synthetic")
  ) {
    return "timeline.item.upserted";
  }
  if (type === "session.status" || type === "session.updated") {
    return "session.updated";
  }
  if (
    type === "session.idle" ||
    type === "session.next.step.failed" ||
    (type === "session.next.step.ended" &&
      event.data?.finish !== "tool-calls" &&
      event.data?.finish !== "tool_calls")
  ) {
    return "turn.completed";
  }
  if (type === "session.next.step.started") {
    return "turn.started";
  }
  return "provider.event";
};

interface RuntimeDurableEvent {
  readonly data?: Readonly<Record<string, unknown>> & {
    readonly finish?: unknown;
    readonly timestamp?: unknown;
  };
  readonly durable?: {
    readonly seq?: unknown;
  };
  readonly id: string;
  readonly type: string;
}

const parseDurableEvent = (value: unknown): RuntimeDurableEvent | undefined => {
  let candidate = value;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate) as unknown;
    } catch {
      return;
    }
  }
  if (
    candidate === null ||
    typeof candidate !== "object" ||
    !("id" in candidate) ||
    typeof candidate.id !== "string" ||
    !("type" in candidate) ||
    typeof candidate.type !== "string"
  ) {
    return;
  }
  return candidate as RuntimeDurableEvent;
};

const durableEventTimestamp = (event: RuntimeDurableEvent) => {
  const timestamp = event.data?.timestamp;
  return typeof timestamp === "number"
    ? new Date(timestamp).toISOString()
    : new Date().toISOString();
};

export class OpenCodeAdapter implements HarnessAdapter {
  readonly manifest = openCodeManifest;
  readonly #client: OpencodeClient;
  #projectListRequest: Promise<readonly ProjectSummary[]> | undefined;
  readonly #projectPaths = new Map<string, string>();

  constructor(input: OpenCodeAdapterOptions | string) {
    const options = typeof input === "string" ? { baseUrl: input } : input;
    const authorization = options.password
      ? `Basic ${Buffer.from(
          `${options.username ?? "opencode"}:${options.password}`,
          "utf8"
        ).toString("base64")}`
      : undefined;
    this.#client = createOpencodeClient({
      baseUrl: options.baseUrl,
      ...(authorization ? { headers: { Authorization: authorization } } : {}),
    });
  }

  async health() {
    const result = await this.#client.global.health({ throwOnError: true });
    return result.data;
  }

  async listProjects(): Promise<readonly ProjectSummary[]> {
    if (this.#projectListRequest) {
      return this.#projectListRequest;
    }

    const request = this.#loadProjects();
    this.#projectListRequest = request;
    try {
      return await request;
    } finally {
      if (this.#projectListRequest === request) {
        this.#projectListRequest = undefined;
      }
    }
  }

  async #loadProjects(): Promise<readonly ProjectSummary[]> {
    const result = await this.#client.project.list({}, { throwOnError: true });

    return result.data.map((project) => {
      const id = openCodeProjectId(project.id);
      this.#projectPaths.set(id, project.worktree);
      const pathName = project.worktree.split("/").filter(Boolean).at(-1);
      const name =
        project.name?.trim() ||
        pathName ||
        (project.id === "global" ? "Global" : project.id);
      return {
        harnessId: "opencode",
        id,
        name,
        native: project,
        path: project.worktree,
      };
    });
  }

  async listFiles(
    input: ListFilesInput
  ): Promise<readonly WorkspaceFileNode[]> {
    const directory = await this.#resolveProjectPath(input.projectId);
    const result = await this.#client.file.list(
      { directory, path: input.path },
      { throwOnError: true }
    );
    return result.data.map((node) => ({
      ignored: node.ignored,
      name: node.name,
      path: node.path,
      type: node.type,
    }));
  }

  async listCatalog(projectId: string): Promise<ProviderCatalog> {
    const directory = await this.#resolveProjectPath(projectId);
    const location = { directory };
    const [models, providers, agents, commands, skills] = await Promise.all([
      this.#client.v2.model.list({ location }, { throwOnError: true }),
      this.#client.v2.provider.list({ location }, { throwOnError: true }),
      this.#client.v2.agent.list({ location }, { throwOnError: true }),
      this.#client.v2.command.list({ location }, { throwOnError: true }),
      this.#client.v2.skill.list({ location }, { throwOnError: true }),
    ]);

    return {
      agents: agents.data.data.map((agent) => ({
        ...(agent.description ? { description: agent.description } : {}),
        hidden: agent.hidden,
        id: agent.id,
        mode: agent.mode,
        ...(agent.model
          ? {
              model: {
                id: agent.model.id,
                providerId: agent.model.providerID,
                ...(agent.model.variant
                  ? { variant: agent.model.variant }
                  : {}),
              },
            }
          : {}),
        native: agent,
      })),
      commands: commands.data.data.map((command) => ({
        ...(command.description ? { description: command.description } : {}),
        name: command.name,
        native: command,
        subtask: command.subtask ?? false,
      })),
      models: models.data.data.map((model) => ({
        enabled: model.enabled,
        id: model.id,
        name: model.name,
        native: model,
        providerId: model.providerID,
        status: model.status,
        variants: model.variants.map((variant) => variant.id),
      })),
      providers: providers.data.data.map((provider) => ({
        disabled: provider.disabled ?? false,
        id: provider.id,
        name: provider.name,
        native: provider,
      })),
      skills: skills.data.data.map((skill) => ({
        ...(skill.description ? { description: skill.description } : {}),
        location: skill.location,
        name: skill.name,
        native: skill,
      })),
    };
  }

  async readFile(input: ReadFileInput): Promise<WorkspaceFileContent> {
    const directory = await this.#resolveProjectPath(input.projectId);
    const result = await this.#client.file.read(
      { directory, path: input.path },
      { throwOnError: true }
    );
    return {
      content: result.data.content,
      ...(result.data.diff ? { diff: result.data.diff } : {}),
      ...(result.data.encoding ? { encoding: result.data.encoding } : {}),
      ...(result.data.mimeType ? { mimeType: result.data.mimeType } : {}),
      type: result.data.type,
    };
  }

  async listFileChanges(
    projectId: string
  ): Promise<readonly WorkspaceFileChange[]> {
    const directory = await this.#resolveProjectPath(projectId);
    const result = await this.#client.vcs.diff(
      { context: 3, directory, mode: "git" },
      { throwOnError: true }
    );
    return result.data.map((change) => ({
      additions: change.additions,
      deletions: change.deletions,
      ...(change.patch ? { patch: change.patch } : {}),
      path: change.file,
      status: change.status ?? "modified",
    }));
  }

  async listSessions(projectId?: string): Promise<readonly SessionSummary[]> {
    const sessionParameters = {
      limit: 200,
      order: "desc" as const,
      roots: true,
    };
    const [sessions, statuses, projects, permissions, questions] =
      await Promise.all([
        this.#client.v2.session.list(sessionParameters, {
          throwOnError: true,
        }),
        this.#client.session.status({}, { throwOnError: true }),
        this.listProjects(),
        this.#client.v2.permission.request
          .list({}, { throwOnError: true })
          .then((result) => result.data.data)
          .catch(() => []),
        this.#client.v2.question.request
          .list({}, { throwOnError: true })
          .then((result) => result.data.data)
          .catch(() => []),
      ]);
    const permissionSessionIds = new Set(
      permissions.map((permission) => permission.sessionID)
    );
    const questionSessionIds = new Set(
      questions.map((question) => question.sessionID)
    );

    // OpenCode 1.17.x accepts `roots: true` but still includes child-agent
    // sessions in this response. Keep the provider boundary honest even when
    // an older server ignores the generated SDK parameter.
    const mapped = sessions.data.data
      .filter((session) => !(session.parentID || session.time.archived))
      .map((session) =>
        mapSession(
          session,
          statuses.data[session.id],
          resolveSessionProjectId(session, projects),
          pendingInputForSession(
            session.id,
            permissionSessionIds,
            questionSessionIds
          )
        )
      );
    return projectId
      ? mapped.filter((session) => session.projectId === projectId)
      : mapped;
  }

  async listServices(projectId: string): Promise<readonly ServiceSummary[]> {
    const directory = await this.#resolveProjectPath(projectId);
    const [mcpResult, lspResult, configResult] = await Promise.allSettled([
      this.#client.mcp.status({ directory }, { throwOnError: true }),
      this.#client.lsp.status({ directory }, { throwOnError: true }),
      this.#client.config.get({ directory }, { throwOnError: true }),
    ]);
    const services: ServiceSummary[] = [];

    if (mcpResult.status === "fulfilled") {
      for (const [name, status] of Object.entries(mcpResult.value.data)) {
        services.push(mapMcpService(name, status));
      }
    } else {
      services.push(serviceFailure("mcp", mcpResult.reason));
    }

    if (lspResult.status === "fulfilled") {
      for (const status of lspResult.value.data) {
        services.push({
          category: "lsp",
          detail: status.root,
          id: `lsp:${status.id}`,
          label: status.name,
          state: status.status === "connected" ? "ready" : "error",
        });
      }
    } else {
      services.push(serviceFailure("lsp", lspResult.reason));
    }

    if (configResult.status === "fulfilled") {
      for (const plugin of configResult.value.data.plugin ?? []) {
        const label = Array.isArray(plugin) ? plugin[0] : plugin;
        services.push({
          category: "plugin",
          id: `plugin:${label}`,
          label,
          state: "ready",
        });
      }
    } else {
      services.push(serviceFailure("plugin", configResult.reason));
    }

    return services;
  }

  async listInteractions(
    sessionId: string
  ): Promise<readonly PendingInteraction[]> {
    const nativeSessionId = openCodeNativeSessionId(sessionId);
    try {
      const [permissions, questions] = await Promise.all([
        this.#client.v2.session.permission.list(
          { sessionID: nativeSessionId },
          { throwOnError: true }
        ),
        this.#client.v2.session.question.list(
          { sessionID: nativeSessionId },
          { throwOnError: true }
        ),
      ]);
      return [
        ...permissions.data.data.map(mapPermissionRequest),
        ...questions.data.data.map(mapQuestionRequest),
      ];
    } catch (error) {
      try {
        const [permissions, questions] = await Promise.all([
          this.#client.v2.permission.request.list({}, { throwOnError: true }),
          this.#client.v2.question.request.list({}, { throwOnError: true }),
        ]);
        return [
          ...permissions.data.data
            .filter((request) => request.sessionID === nativeSessionId)
            .map(mapPermissionRequest),
          ...questions.data.data
            .filter((request) => request.sessionID === nativeSessionId)
            .map(mapQuestionRequest),
        ];
      } catch (fallbackError) {
        const primaryMessage =
          error instanceof Error ? error.message : "Unknown primary failure";
        throw new Error(
          `OpenCode interaction endpoints are unavailable: ${primaryMessage}`,
          { cause: fallbackError }
        );
      }
    }
  }

  async listTimeline(
    sessionId: string,
    olderCursor?: string
  ): Promise<TimelinePage> {
    const nativeSessionId = openCodeNativeSessionId(sessionId);
    const publicSessionId = openCodeSessionId(nativeSessionId);
    if (olderCursor?.startsWith("msg_")) {
      return this.#listLegacyTimeline(publicSessionId, olderCursor);
    }

    const result = await this.#client.v2.session
      .messages(
        {
          ...(olderCursor ? { cursor: olderCursor } : { order: "desc" }),
          limit: 100,
          sessionID: nativeSessionId,
        },
        { throwOnError: true }
      )
      .catch(() => undefined);

    if (!result || result.data.data.length === 0) {
      return this.#listLegacyTimeline(publicSessionId);
    }

    return {
      items: result.data.data
        .map((message) => mapTimelineMessage(publicSessionId, message))
        .reverse(),
      ...(result.data.cursor.next
        ? { olderCursor: result.data.cursor.next }
        : {}),
    };
  }

  async bootstrapSession(sessionId: string): Promise<SessionBootstrap> {
    const [session, timeline] = await Promise.all([
      this.#loadSessionSummary(sessionId),
      this.listTimeline(sessionId),
    ]);
    return { session, timeline };
  }

  async #listLegacyTimeline(
    sessionId: string,
    before?: string
  ): Promise<TimelinePage> {
    const nativeSessionId = openCodeNativeSessionId(sessionId);
    const session = await this.#loadSessionInfo(sessionId);
    const result = await this.#client.session.messages(
      {
        ...(before ? { before } : {}),
        directory: session.location.directory,
        limit: 100,
        sessionID: nativeSessionId,
      },
      { throwOnError: true }
    );
    const items = result.data.flatMap((message) => {
      const mapped = mapLegacyTimelineMessage(sessionId, message);
      return mapped ? [mapped] : [];
    });
    const olderCursor =
      result.data.length === 100 ? result.data[0]?.info.id : undefined;

    return {
      items,
      ...(olderCursor ? { olderCursor } : {}),
    };
  }

  async createSession(input: CreateSessionInput): Promise<SessionSummary> {
    const directory = await this.#resolveProjectPath(input.projectId);
    const result = await this.#client.v2.session.create(
      { location: { directory } },
      { throwOnError: true }
    );
    return mapSession(result.data.data, undefined, input.projectId);
  }

  async archiveSession(input: ArchiveSessionInput): Promise<void> {
    const nativeSessionId = openCodeNativeSessionId(input.sessionId);
    const current = await this.#loadSessionInfo(input.sessionId);
    const {
      location: { directory },
    } = current;
    await this.#client.session.update(
      {
        directory,
        sessionID: nativeSessionId,
        time: { archived: Date.now() },
      },
      { throwOnError: true }
    );
  }

  async renameSession(input: RenameSessionInput): Promise<SessionSummary> {
    const nativeSessionId = openCodeNativeSessionId(input.sessionId);
    const current = await this.#loadSessionInfo(input.sessionId);
    const {
      location: { directory },
    } = current;
    await this.#client.session.update(
      {
        directory,
        sessionID: nativeSessionId,
        title: input.title,
      },
      { throwOnError: true }
    );
    const updated = await this.#loadSessionInfo(input.sessionId);
    const projects = await this.listProjects();
    return mapSession(
      updated,
      undefined,
      resolveSessionProjectId(updated, projects)
    );
  }

  async sendTurn(input: SendTurnInput): Promise<void> {
    const nativeSessionId = openCodeNativeSessionId(input.sessionId);
    await this.#client.v2.session.prompt(
      {
        delivery: "steer",
        prompt: { text: input.text },
        sessionID: nativeSessionId,
      },
      { throwOnError: true }
    );
  }

  async selectModel(input: SelectModelInput): Promise<SessionSummary> {
    const nativeSessionId = openCodeNativeSessionId(input.sessionId);
    await this.#client.v2.session.switchModel(
      {
        model: {
          id: input.id,
          providerID: input.providerId,
          ...(input.variant ? { variant: input.variant } : {}),
        },
        sessionID: nativeSessionId,
      },
      { throwOnError: true }
    );
    return this.#loadSessionSummary(input.sessionId);
  }

  async selectAgent(input: SelectAgentInput): Promise<SessionSummary> {
    const nativeSessionId = openCodeNativeSessionId(input.sessionId);
    await this.#client.v2.session.switchAgent(
      { agent: input.agentId, sessionID: nativeSessionId },
      { throwOnError: true }
    );
    return this.#loadSessionSummary(input.sessionId);
  }

  async abortTurn(sessionId: string): Promise<void> {
    const nativeSessionId = openCodeNativeSessionId(sessionId);
    await this.#client.v2.session.interrupt(
      { sessionID: nativeSessionId },
      { throwOnError: true }
    );
  }

  async respondPermission(input: RespondPermissionInput): Promise<void> {
    const nativeSessionId = openCodeNativeSessionId(input.sessionId);
    await this.#client.v2.session.permission.reply(
      {
        ...(input.message ? { message: input.message } : {}),
        reply: input.decision,
        requestID: input.requestId,
        sessionID: nativeSessionId,
      },
      { throwOnError: true }
    );
  }

  async respondQuestion(input: RespondQuestionInput): Promise<void> {
    const nativeSessionId = openCodeNativeSessionId(input.sessionId);
    if (input.action === "reject") {
      await this.#client.v2.session.question.reject(
        { requestID: input.requestId, sessionID: nativeSessionId },
        { throwOnError: true }
      );
      return;
    }

    await this.#client.v2.session.question.reply(
      {
        questionV2Reply: {
          answers: input.answers.map((answer) => [...answer]),
        },
        requestID: input.requestId,
        sessionID: nativeSessionId,
      },
      { throwOnError: true }
    );
  }

  async *subscribe(
    sessionId: string,
    signal?: AbortSignal,
    afterCursor?: string
  ): AsyncIterable<ProviderEvent> {
    const nativeSessionId = openCodeNativeSessionId(sessionId);
    const publicSessionId = openCodeSessionId(nativeSessionId);
    const session = await this.#loadSessionInfo(publicSessionId);
    const projects = await this.listProjects();
    const projectId = resolveSessionProjectId(session, projects);
    const events = await this.#client.v2.session.events(
      {
        ...(afterCursor ? { after: afterCursor } : {}),
        sessionID: nativeSessionId,
      },
      signal ? { signal } : undefined
    );

    let fallbackSequence = 0;
    for await (const rawEvent of events.stream) {
      const event = parseDurableEvent(rawEvent);
      if (!event) {
        continue;
      }
      fallbackSequence += 1;
      const durableSequence = event.durable?.seq;
      yield {
        ...(typeof durableSequence === "number"
          ? { cursor: String(durableSequence) }
          : {}),
        eventId: event.id,
        kind: mapEventKind(event),
        native: event,
        projectId,
        providerId: this.manifest.id,
        sequence:
          typeof durableSequence === "number"
            ? durableSequence
            : fallbackSequence,
        sessionId: publicSessionId,
        timestamp: durableEventTimestamp(event),
      };
    }
  }

  async #resolveProjectPath(projectId: string): Promise<string> {
    const cached = this.#projectPaths.get(projectId);
    if (cached) {
      return cached;
    }

    const projects = await this.listProjects();
    const project = projects.find((candidate) => candidate.id === projectId);
    if (!project) {
      throw new Error(`OpenCode project not found: ${projectId}`);
    }
    return project.path;
  }

  async #loadSessionSummary(sessionId: string): Promise<ReadySessionSummary> {
    const session = await this.#loadSessionInfo(sessionId);
    const projects = await this.listProjects();
    return mapSession(
      session,
      undefined,
      resolveSessionProjectId(session, projects)
    );
  }

  async #loadSessionInfo(sessionId: string): Promise<SessionV2Info> {
    const nativeSessionId = openCodeNativeSessionId(sessionId);
    try {
      const result = await this.#client.v2.session.get(
        { sessionID: nativeSessionId },
        { throwOnError: true }
      );
      return result.data.data;
    } catch (error) {
      const session = await this.#findListedSession(nativeSessionId);
      if (session) {
        return session;
      }
      throw error;
    }
  }

  async #findListedSession(
    sessionId: string,
    cursor?: string,
    seenCursors: ReadonlySet<string> = new Set()
  ): Promise<SessionV2Info | undefined> {
    const result = await this.#client.v2.session.list(
      {
        ...(cursor ? { cursor } : {}),
        limit: 200,
        order: "desc",
      },
      { throwOnError: true }
    );
    const session = result.data.data.find(
      (candidate) => candidate.id === sessionId
    );
    if (session) {
      return session;
    }
    const { next } = result.data.cursor;
    if (!(next && !seenCursors.has(next))) {
      return;
    }
    return this.#findListedSession(
      sessionId,
      next,
      new Set([...seenCursors, next])
    );
  }
}

const mapMcpService = (name: string, status: McpStatus): ServiceSummary => {
  const stateByStatus = {
    connected: "ready",
    disabled: "disabled",
    failed: "error",
    needs_auth: "attention",
    needs_client_registration: "attention",
  } as const satisfies Record<McpStatus["status"], ServiceState>;

  return {
    category: "mcp",
    ...(status.status === "failed" ||
    status.status === "needs_client_registration"
      ? { detail: status.error }
      : {}),
    id: `mcp:${name}`,
    label: name,
    state: stateByStatus[status.status],
  };
};

const serviceFailure = (
  category: ServiceCategory,
  reason: unknown
): ServiceSummary => ({
  category,
  detail: reason instanceof Error ? reason.message : "Status unavailable",
  id: `${category}:status-unavailable`,
  label: `${category.toUpperCase()} status`,
  state: "error",
});
