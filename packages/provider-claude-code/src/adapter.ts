import { randomUUID } from "node:crypto";
import { readdir, readFile as readFileBytes } from "node:fs/promises";
import { isAbsolute, resolve, sep } from "node:path";
import type { ProviderCatalog } from "@vibepad/protocol/catalog";
import type {
  ProviderEvent,
  ProviderEventKind,
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

import { type ClaudeCodeDetection, detectClaudeCode } from "./detect";
import { ClaudeCodeEventHub } from "./event-hub";
import {
  claudeCodeNativeSessionId,
  claudeCodeProjectId,
  claudeCodeProjectName,
  claudeCodeProjectPath,
  claudeCodeSessionId,
} from "./ids";
import { claudeCodeManifest } from "./manifest";
import { ClaudeCodePermissionBroker } from "./permissions";
import { ClaudeCodeSessionRuntime } from "./runtime";
import {
  type ClaudeCodeSdk,
  type ClaudePermissionMode,
  type ClaudeSessionInfo,
  type ClaudeSettingSource,
  defaultClaudeCodeSdk,
} from "./sdk";
import { mapClaudeTimeline } from "./timeline";

export interface ClaudeCodeAdapterOptions {
  readonly detection?: ClaudeCodeDetection;
  readonly eventStore?: ProviderEventStore;
  readonly projectRoots?: readonly string[];
  readonly sdk?: ClaudeCodeSdk;
  readonly sessionControlStore?: SessionControlStore;
  /**
   * Filesystem settings layers loaded by spawned runtimes. Omitted inherits
   * everything (Claude Code parity); `[]` isolates sessions from
   * machine-local settings, allow rules, and hooks.
   */
  readonly settingSources?: readonly ClaudeSettingSource[];
}

interface DraftSession {
  readonly createdAt: string;
  readonly cwd: string;
  title: string;
}

const permissionModes = [
  "default",
  "acceptEdits",
  "plan",
  "bypassPermissions",
] as const;

const permissionModeDescriptions: Readonly<
  Record<ClaudePermissionMode, string>
> = {
  acceptEdits: "Auto-approve file edits; ask for everything else",
  bypassPermissions: "Skip all permission prompts",
  default: "Ask before dangerous operations",
  plan: "Read-only planning; no execution of dangerous tools",
};

const isPermissionMode = (value: string): value is ClaudePermissionMode =>
  (permissionModes as readonly string[]).includes(value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const property = (record: Record<string, unknown>, key: string): unknown =>
  Reflect.get(record, key);

const trailingSlash = /\/$/u;

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

const sessionTitle = (info: ClaudeSessionInfo) =>
  info.customTitle?.trim() ||
  info.summary.trim() ||
  info.firstPrompt?.trim() ||
  "New Claude Code session";

export class ClaudeCodeAdapter implements HarnessAdapter {
  readonly manifest = claudeCodeManifest;
  readonly #broker: ClaudeCodePermissionBroker;
  readonly #configuredRoots: readonly string[];
  readonly #detection: ClaudeCodeDetection;
  readonly #drafts = new Map<string, DraftSession>();
  readonly #hub: ClaudeCodeEventHub;
  readonly #liveEntries = new Map<string, Map<string, unknown>>();
  readonly #runtimes = new Map<string, ClaudeCodeSessionRuntime>();
  readonly #sdk: ClaudeCodeSdk;
  readonly #sessionControlStore: SessionControlStore | undefined;
  readonly #sessionInfo = new Map<string, ClaudeSessionInfo>();
  readonly #settingSources: readonly ClaudeSettingSource[] | undefined;

  constructor(options: ClaudeCodeAdapterOptions = {}) {
    this.#broker = new ClaudeCodePermissionBroker({
      onExitPlanApproved: (sessionId) => {
        this.#applyExitPlanMode(sessionId).catch(() => undefined);
      },
      onRequested: (interaction) => {
        this.#emitForSession(
          interaction.sessionId,
          interaction.kind === "permission"
            ? "permission.requested"
            : "question.requested",
          interaction
        );
      },
      onResolved: (interaction) => {
        this.#emitForSession(
          interaction.sessionId,
          interaction.kind === "permission"
            ? "permission.resolved"
            : "question.resolved",
          interaction
        );
      },
    });
    this.#configuredRoots = [
      ...new Set(
        (options.projectRoots ?? [process.cwd()]).map((path) => resolve(path))
      ),
    ];
    this.#detection = options.detection ?? detectClaudeCode();
    this.#hub = new ClaudeCodeEventHub(options.eventStore);
    this.#sdk = options.sdk ?? defaultClaudeCodeSdk;
    this.#sessionControlStore = options.sessionControlStore;
    this.#settingSources = options.settingSources;
  }

  dispose(): Promise<void> {
    for (const runtime of this.#runtimes.values()) {
      runtime.dispose();
    }
    this.#runtimes.clear();
    return Promise.resolve();
  }

  health(): Promise<{ healthy: boolean; version?: string }> {
    return Promise.resolve({
      healthy: this.#detection.available,
      ...(this.#detection.version ? { version: this.#detection.version } : {}),
    });
  }

  async listProjects(): Promise<readonly ProjectSummary[]> {
    const roots = new Map<string, number>(
      this.#configuredRoots.map((path) => [path, 0])
    );
    const sessions = await this.#sdk.listSessions();
    for (const session of sessions) {
      this.#sessionInfo.set(session.sessionId, session);
      if (!session.cwd) {
        continue;
      }
      roots.set(session.cwd, (roots.get(session.cwd) ?? 0) + 1);
    }
    return [...roots.entries()]
      .map(([path, sessionCount]) => ({
        harnessId: "claude-code" as const,
        id: claudeCodeProjectId(path),
        name: claudeCodeProjectName(path),
        native: { path, sessionCount },
        path,
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  async listSessions(projectId?: string): Promise<readonly SessionSummary[]> {
    const cwd = projectId ? claudeCodeProjectPath(projectId) : undefined;
    const persisted = await this.#sdk.listSessions(cwd ? { dir: cwd } : {});
    const summaries: SessionSummary[] = [];
    const onDisk = new Set<string>();
    for (const info of persisted) {
      this.#sessionInfo.set(info.sessionId, info);
      onDisk.add(info.sessionId);
      this.#drafts.delete(info.sessionId);
      summaries.push(this.#mapPersistedSession(info));
    }
    for (const [nativeId, draft] of this.#drafts) {
      if (onDisk.has(nativeId) || (cwd && draft.cwd !== cwd)) {
        continue;
      }
      summaries.push(this.#mapDraftSession(nativeId, draft));
    }
    return summaries.sort((left, right) =>
      (right.updatedAt ?? "").localeCompare(left.updatedAt ?? "")
    );
  }

  createSession(input: CreateSessionInput): Promise<SessionSummary> {
    const cwd = claudeCodeProjectPath(input.projectId);
    const nativeId = randomUUID();
    const draft: DraftSession = {
      createdAt: new Date().toISOString(),
      cwd,
      title: "New Claude Code session",
    };
    this.#drafts.set(nativeId, draft);
    this.#writeControls(nativeId, { agent: "default", status: "ready" });
    const summary = this.#mapDraftSession(nativeId, draft);
    this.#emitForSession(summary.id, "session.updated", summary);
    return Promise.resolve(summary);
  }

  archiveSession(input: ArchiveSessionInput): Promise<void> {
    return Promise.reject(
      new Error(
        `Claude Code cannot archive sessions; deletion is destructive and not part of the VibePad contract: ${input.sessionId}`
      )
    );
  }

  async renameSession(input: RenameSessionInput): Promise<SessionSummary> {
    const nativeId = claudeCodeNativeSessionId(input.sessionId);
    const draft = this.#drafts.get(nativeId);
    if (draft) {
      draft.title = input.title;
      const summary = this.#mapDraftSession(nativeId, draft);
      this.#emitForSession(summary.id, "session.updated", summary);
      return summary;
    }
    const cwd = this.#sessionInfo.get(nativeId)?.cwd;
    await this.#sdk.renameSession(
      nativeId,
      input.title,
      cwd ? { dir: cwd } : {}
    );
    const info = this.#sessionInfo.get(nativeId);
    if (info) {
      this.#sessionInfo.set(nativeId, { ...info, customTitle: input.title });
    }
    const summary = await this.#readSession(nativeId);
    this.#emitForSession(summary.id, "session.updated", summary);
    return summary;
  }

  async listTimeline(
    sessionId: string,
    _olderCursor?: string
  ): Promise<TimelinePage> {
    const nativeId = claudeCodeNativeSessionId(sessionId);
    const publicId = claudeCodeSessionId(nativeId);
    const cwd =
      this.#drafts.get(nativeId)?.cwd ?? this.#sessionInfo.get(nativeId)?.cwd;
    // Always attempt the disk transcript: a session created as a draft lands
    // on disk during its first turn, and the live SDK stream does not echo
    // plain user messages, so disk is the only durable source for them.
    const persisted = await this.#sdk
      .getSessionMessages(nativeId, {
        ...(cwd ? { dir: cwd } : {}),
        includeSystemMessages: true,
      })
      .catch(() => [] as const);
    const persistedIds = new Set<string>();
    const persistedUserTexts = new Set<string>();
    for (const entry of persisted) {
      if (!isRecord(entry)) {
        continue;
      }
      const uuid = property(entry, "uuid");
      if (typeof uuid === "string") {
        persistedIds.add(uuid);
      }
      if (property(entry, "type") === "user") {
        const message = property(entry, "message");
        const content = isRecord(message)
          ? property(message, "content")
          : undefined;
        if (typeof content === "string") {
          persistedUserTexts.add(content);
        }
      }
    }
    const live = [...(this.#liveEntries.get(nativeId)?.entries() ?? [])]
      .filter(([uuid, entry]) => {
        if (persistedIds.has(uuid)) {
          return false;
        }
        // Synthetic user entries (recorded at sendTurn because the stream
        // does not echo them) are superseded by their transcript twins.
        if (isRecord(entry) && property(entry, "vibepadSynthetic") === true) {
          const message = property(entry, "message");
          const content = isRecord(message)
            ? property(message, "content")
            : undefined;
          return !(
            typeof content === "string" && persistedUserTexts.has(content)
          );
        }
        return true;
      })
      .map(([, entry]) => entry);
    const fallbackTimestamp = this.#fallbackTimestamp(nativeId);
    return {
      items: mapClaudeTimeline(
        publicId,
        [...persisted, ...live],
        fallbackTimestamp
      ),
    };
  }

  async bootstrapSession(sessionId: string): Promise<SessionBootstrap> {
    const nativeId = claudeCodeNativeSessionId(sessionId);
    if (!this.#controlsFor(nativeId)) {
      this.#writeControls(nativeId, { agent: "default", status: "ready" });
    }
    const [session, timeline] = await Promise.all([
      this.#readSession(nativeId),
      this.listTimeline(sessionId),
    ]);
    return { session: readySessionSummarySchema.parse(session), timeline };
  }

  async sendTurn(input: SendTurnInput): Promise<void> {
    const nativeId = claudeCodeNativeSessionId(input.sessionId);
    const runtime =
      this.#runtimes.get(nativeId) ?? (await this.#startRuntime(nativeId));
    runtime.send(input.text);
    this.#emitForNative(nativeId, "turn.started", { text: input.text });
    // The SDK stream never echoes plain user messages, so record a synthetic
    // timeline entry immediately; the transcript twin replaces it once the
    // CLI flushes the session file to disk.
    const syntheticEntry = {
      message: { content: input.text, role: "user" },
      parent_tool_use_id: null,
      session_id: nativeId,
      timestamp: new Date().toISOString(),
      type: "user",
      uuid: `vibepad-user:${randomUUID()}`,
      vibepadSynthetic: true,
    };
    const entries =
      this.#liveEntries.get(nativeId) ?? new Map<string, unknown>();
    entries.set(syntheticEntry.uuid, syntheticEntry);
    this.#liveEntries.set(nativeId, entries);
    this.#emitForNative(nativeId, "timeline.item.upserted", syntheticEntry);
  }

  async abortTurn(sessionId: string): Promise<void> {
    const nativeId = claudeCodeNativeSessionId(sessionId);
    const runtime = this.#runtimes.get(nativeId);
    if (!runtime) {
      throw new Error(`Claude Code session has no active turn: ${sessionId}`);
    }
    await runtime.interrupt();
  }

  listCatalog(_projectId: string): Promise<ProviderCatalog> {
    return Promise.resolve({
      agents: permissionModes.map((mode) => ({
        description: permissionModeDescriptions[mode],
        hidden: false,
        id: mode,
        mode: "primary" as const,
        native: { permissionMode: mode },
      })),
      commands: [],
      models: ["sonnet", "opus", "haiku"].map((alias) => ({
        enabled: true,
        id: alias,
        name: alias.charAt(0).toUpperCase() + alias.slice(1),
        native: { alias },
        providerId: "anthropic",
        status: "active" as const,
        variants: [],
      })),
      providers: [
        {
          disabled: false,
          id: "anthropic",
          name: "Anthropic",
          native: { id: "anthropic" },
        },
      ],
      skills: [],
    });
  }

  async selectModel(input: SelectModelInput): Promise<SessionSummary> {
    const nativeId = claudeCodeNativeSessionId(input.sessionId);
    const controls = this.#controlsFor(nativeId);
    this.#writeControls(nativeId, {
      ...(controls?.agent ? { agent: controls.agent } : {}),
      model: {
        id: input.id,
        providerId: input.providerId,
        ...(input.variant ? { variant: input.variant } : {}),
      },
      status: "ready",
    });
    await this.#runtimes.get(nativeId)?.setModel(input.id);
    const summary = await this.#readSession(nativeId);
    this.#emitForSession(summary.id, "session.updated", summary);
    return summary;
  }

  async selectAgent(input: SelectAgentInput): Promise<SessionSummary> {
    const nativeId = claudeCodeNativeSessionId(input.sessionId);
    if (!isPermissionMode(input.agentId)) {
      throw new Error(
        `Claude Code permission mode not found: ${input.agentId}`
      );
    }
    const publicId = claudeCodeSessionId(nativeId);
    this.#broker.setMode(publicId, input.agentId);
    const controls = this.#controlsFor(nativeId);
    this.#writeControls(nativeId, {
      agent: input.agentId,
      ...(controls?.model ? { model: controls.model } : {}),
      status: "ready",
    });
    await this.#runtimes.get(nativeId)?.setPermissionMode(input.agentId);
    const summary = await this.#readSession(nativeId);
    this.#emitForSession(summary.id, "session.updated", summary);
    return summary;
  }

  listInteractions(sessionId: string): Promise<readonly PendingInteraction[]> {
    return Promise.resolve(this.#broker.listPending(sessionId));
  }

  respondPermission(input: RespondPermissionInput): Promise<void> {
    this.#broker.respondPermission(input);
    return Promise.resolve();
  }

  respondQuestion(input: RespondQuestionInput): Promise<void> {
    this.#broker.respondQuestion(input);
    return Promise.resolve();
  }

  async listFiles(
    input: ListFilesInput
  ): Promise<readonly WorkspaceFileNode[]> {
    const absolute = this.#projectFilePath(input.projectId, input.path);
    const entries = await readdir(absolute, { withFileTypes: true });
    return entries.flatMap((entry) => {
      if (!(entry.isDirectory() || entry.isFile())) {
        return [];
      }
      const path = [input.path.replace(trailingSlash, ""), entry.name]
        .filter(Boolean)
        .join("/");
      return [
        {
          ignored: likelyIgnored(entry.name),
          name: entry.name,
          path,
          type: entry.isDirectory()
            ? ("directory" as const)
            : ("file" as const),
        },
      ];
    });
  }

  async readFile(input: ReadFileInput): Promise<WorkspaceFileContent> {
    const absolute = this.#projectFilePath(input.projectId, input.path);
    const bytes = await readFileBytes(absolute);
    const mimeType = mimeForPath(input.path);
    if (bytes.includes(0)) {
      return {
        content: bytes.toString("base64"),
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

  listFileChanges(_projectId: string): Promise<readonly WorkspaceFileChange[]> {
    // Claude Code exposes no diff service; the capability is marked
    // unsupported in the manifest.
    return Promise.resolve([]);
  }

  listServices(_projectId: string): Promise<readonly ServiceSummary[]> {
    return Promise.resolve([]);
  }

  async *subscribe(
    sessionId: string,
    signal?: AbortSignal,
    afterCursor?: string
  ): AsyncIterable<ProviderEvent> {
    yield* this.#hub.subscribe(sessionId, signal, afterCursor);
  }

  async #startRuntime(nativeId: string): Promise<ClaudeCodeSessionRuntime> {
    const draft = this.#drafts.get(nativeId);
    const cwd = draft?.cwd ?? (await this.#resolveSessionCwd(nativeId));
    const publicId = claudeCodeSessionId(nativeId);
    const controls = this.#controlsFor(nativeId);
    const storedMode =
      controls?.agent && isPermissionMode(controls.agent)
        ? controls.agent
        : undefined;
    if (storedMode) {
      this.#broker.setMode(publicId, storedMode);
    }
    const runtime = new ClaudeCodeSessionRuntime({
      canUseTool: this.#broker.canUseToolFor(publicId),
      cwd,
      ...(controls?.model?.id ? { model: controls.model.id } : {}),
      nativeSessionId: nativeId,
      onError: (error) => {
        this.#emitForNative(nativeId, "turn.completed", {
          error: error instanceof Error ? error.message : String(error),
        });
      },
      onExit: () => {
        if (this.#runtimes.get(nativeId) === runtime) {
          this.#runtimes.delete(nativeId);
        }
        this.#broker.reset(publicId, "The Claude Code session runtime exited");
      },
      onMessage: (message) => {
        this.#handleRuntimeMessage(nativeId, message);
      },
      ...(this.#detection.executablePath &&
      this.#detection.source === "configured"
        ? { pathToClaudeCodeExecutable: this.#detection.executablePath }
        : {}),
      ...(storedMode ? { permissionMode: storedMode } : {}),
      resume: !draft,
      sdk: this.#sdk,
      ...(this.#settingSources ? { settingSources: this.#settingSources } : {}),
    });
    this.#runtimes.set(nativeId, runtime);
    return runtime;
  }

  #handleRuntimeMessage(nativeId: string, message: unknown): void {
    if (!isRecord(message)) {
      return;
    }
    const uuid = property(message, "uuid");
    if (typeof uuid === "string") {
      const entries =
        this.#liveEntries.get(nativeId) ?? new Map<string, unknown>();
      entries.set(uuid, message);
      this.#liveEntries.set(nativeId, entries);
    }
    const type = property(message, "type");
    if (type === "result") {
      this.#emitForNative(nativeId, "turn.completed", message);
      return;
    }
    if (type === "system") {
      const subtype = property(message, "subtype");
      if (subtype === "init") {
        this.#emitForNative(nativeId, "session.updated", message);
        return;
      }
      if (subtype === "compact_boundary") {
        this.#emitForNative(nativeId, "timeline.item.upserted", message);
        return;
      }
      this.#emitForNative(nativeId, "provider.event", message);
      return;
    }
    if (type === "assistant" || type === "user") {
      this.#emitForNative(nativeId, "timeline.item.upserted", message);
      return;
    }
    this.#emitForNative(nativeId, "provider.event", message);
  }

  async #applyExitPlanMode(sessionId: string): Promise<void> {
    const nativeId = claudeCodeNativeSessionId(sessionId);
    const controls = this.#controlsFor(nativeId);
    this.#writeControls(nativeId, {
      agent: "default",
      ...(controls?.model ? { model: controls.model } : {}),
      status: "ready",
    });
    await this.#runtimes.get(nativeId)?.setPermissionMode("default");
    this.#emitForNative(nativeId, "session.updated", {
      permissionMode: "default",
    });
  }

  async #resolveSessionCwd(nativeId: string): Promise<string> {
    const cached = this.#sessionInfo.get(nativeId)?.cwd;
    if (cached) {
      return cached;
    }
    const sessions = await this.#sdk.listSessions();
    for (const session of sessions) {
      this.#sessionInfo.set(session.sessionId, session);
    }
    return (
      this.#sessionInfo.get(nativeId)?.cwd ??
      this.#configuredRoots[0] ??
      process.cwd()
    );
  }

  async #readSession(nativeId: string): Promise<SessionSummary> {
    const draft = this.#drafts.get(nativeId);
    if (draft) {
      return this.#mapDraftSession(nativeId, draft);
    }
    const cached = this.#sessionInfo.get(nativeId);
    if (cached) {
      return this.#mapPersistedSession(cached);
    }
    const sessions = await this.#sdk.listSessions();
    for (const session of sessions) {
      this.#sessionInfo.set(session.sessionId, session);
    }
    const info = this.#sessionInfo.get(nativeId);
    if (!info) {
      throw new Error(`Claude Code session not found: ${nativeId}`);
    }
    return this.#mapPersistedSession(info);
  }

  #mapPersistedSession(info: ClaudeSessionInfo): SessionSummary {
    const publicId = claudeCodeSessionId(info.sessionId);
    const pendingInput = this.#broker.pendingInputFor(publicId);
    const base = {
      activity: this.#runtimes.get(info.sessionId)?.busy
        ? ("busy" as const)
        : ("idle" as const),
      harnessId: "claude-code" as const,
      id: publicId,
      native: info,
      ...(pendingInput ? { pendingInput } : {}),
      projectId: claudeCodeProjectId(
        info.cwd ?? this.#configuredRoots[0] ?? process.cwd()
      ),
      title: sessionTitle(info),
      updatedAt: new Date(info.lastModified).toISOString(),
    };
    const controls = this.#controlsFor(info.sessionId);
    if (controls) {
      return { ...base, controls };
    }
    return { ...base, controls: { status: "inventory" } };
  }

  #mapDraftSession(nativeId: string, draft: DraftSession): SessionSummary {
    const publicId = claudeCodeSessionId(nativeId);
    const pendingInput = this.#broker.pendingInputFor(publicId);
    return {
      activity: this.#runtimes.get(nativeId)?.busy ? "busy" : "idle",
      controls: this.#controlsFor(nativeId) ?? {
        agent: "default",
        status: "ready",
      },
      harnessId: "claude-code",
      id: publicId,
      native: { draft: true, nativeSessionId: nativeId },
      ...(pendingInput ? { pendingInput } : {}),
      projectId: claudeCodeProjectId(draft.cwd),
      title: draft.title,
      updatedAt: draft.createdAt,
    };
  }

  #controlsFor(nativeId: string): ReadySessionControls | undefined {
    return this.#sessionControlStore?.read(
      "claude-code",
      claudeCodeSessionId(nativeId)
    );
  }

  #writeControls(nativeId: string, controls: ReadySessionControls): void {
    this.#sessionControlStore?.write(
      "claude-code",
      claudeCodeSessionId(nativeId),
      controls
    );
  }

  #fallbackTimestamp(nativeId: string): string {
    const draft = this.#drafts.get(nativeId);
    if (draft) {
      return draft.createdAt;
    }
    const info = this.#sessionInfo.get(nativeId);
    const millis = info?.createdAt ?? info?.lastModified;
    return millis ? new Date(millis).toISOString() : new Date().toISOString();
  }

  #projectFilePath(projectId: string, path: string) {
    const root = resolve(claudeCodeProjectPath(projectId));
    const candidate = resolve(root, path);
    if (
      !isAbsolute(candidate) ||
      (candidate !== root && !candidate.startsWith(`${root}${sep}`))
    ) {
      throw new Error(`File path escapes Claude Code project: ${path}`);
    }
    return candidate;
  }

  #projectIdForNative(nativeId: string): string {
    const draft = this.#drafts.get(nativeId);
    const cwd =
      draft?.cwd ??
      this.#sessionInfo.get(nativeId)?.cwd ??
      this.#configuredRoots[0] ??
      process.cwd();
    return claudeCodeProjectId(cwd);
  }

  #emitForNative(
    nativeId: string,
    kind: ProviderEventKind,
    native: unknown
  ): void {
    this.#hub.emit({
      kind,
      native,
      projectId: this.#projectIdForNative(nativeId),
      sessionId: claudeCodeSessionId(nativeId),
    });
  }

  #emitForSession(
    sessionId: string,
    kind: ProviderEventKind,
    native: unknown
  ): void {
    this.#emitForNative(claudeCodeNativeSessionId(sessionId), kind, native);
  }
}
