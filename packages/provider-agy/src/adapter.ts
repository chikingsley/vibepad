/**
 * VibePad adapter for the Google Antigravity CLI (`agy`).
 *
 * Protocol model (see manifest.ts and cli-args.ts for citations): agy has no
 * streaming-event protocol. Each turn spawns one `agy --print` process whose
 * stdout is the answer text; exit 0 completes the turn and a non-zero exit
 * fails it (happy-cli/src/agy/AgyBackend.ts:5-15). Conversation continuity
 * comes from agy's cwd-keyed cache of last conversation ids, resumed via
 * `--conversation` (happy-cli/src/agy/conversationStore.ts:1-43). Two public
 * bug reports pin the process contract: stdin must reach EOF immediately or
 * agy hangs (happy-cli/src/agy/AgyBackend.ts:122-127,
 * https://github.com/google-antigravity/antigravity-cli/issues/318), and
 * stdout must be consumed as a stream
 * (https://github.com/google-antigravity/antigravity-cli/issues/76).
 */

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
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
  ProjectSummary,
  ReadFileInput,
  ReadySessionSummary,
  RenameSessionInput,
  SelectAgentInput,
  SelectModelInput,
  SendTurnInput,
  ServiceSummary,
  SessionActivity,
  SessionBootstrap,
  SessionControlStore,
  SessionSummary,
} from "@vibepad/protocol/provider";
import type { TimelinePage } from "@vibepad/protocol/timeline";

import { buildAgyArgs } from "./cli-args";
import {
  AGY_MODELS,
  AGY_PRINT_TIMEOUT,
  agyConversationsCachePath,
  DEFAULT_AGY_MODEL,
  resolveAgyBin,
} from "./constants";
import {
  listAgyConversationWorkspaces,
  readAgyConversationId,
} from "./conversation-cache";
import { AgyEventHub } from "./event-hub";
import {
  agyCachedSessionKey,
  agyHarnessId,
  agyLiveSessionKey,
  agyProjectId,
  agyProjectName,
  agyProjectPath,
  agySessionId,
  agySessionKey,
  decodeCachedSessionKey,
} from "./ids";
import { agyManifest } from "./manifest";
import { type AgyTurn, mapAgyTurns } from "./timeline";

export interface AgyStreamEmitter {
  readonly on: (event: "data", listener: (chunk: string) => void) => unknown;
  readonly setEncoding: (encoding: "utf8") => unknown;
}

export interface AgyChildProcess {
  readonly kill: (signal?: NodeJS.Signals) => boolean;
  readonly on: ((
    event: "close",
    listener: (code: number | null) => void
  ) => unknown) &
    ((event: "error", listener: (error: Error) => void) => unknown);
  readonly stderr: AgyStreamEmitter | null;
  readonly stdout: AgyStreamEmitter | null;
}

export interface AgySpawnOptions {
  readonly cwd: string;
  readonly env: Readonly<Record<string, string | undefined>>;
}

export type AgySpawnFn = (
  command: string,
  args: readonly string[],
  options: AgySpawnOptions
) => AgyChildProcess;

/**
 * Default spawner. agy --print blocks until stdin reaches EOF, so the child
 * gets an empty stdin (immediate EOF) instead of an open pipe; otherwise it
 * hangs forever (happy-cli/src/agy/AgyBackend.ts:122-127; corroborated by
 * https://github.com/google-antigravity/antigravity-cli/issues/318).
 */
const defaultSpawn: AgySpawnFn = (command, args, options) =>
  spawn(command, [...args], {
    cwd: options.cwd,
    env: { ...options.env },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

/**
 * Parse an agy duration string ("10m", "30s", "1h") to milliseconds,
 * defaulting to ten minutes (happy-cli/src/agy/AgyBackend.ts:51-57).
 */
const printTimeoutPattern = /^(?<amount>\d+)\s*(?<unit>s|m|h)$/u;

export const parsePrintTimeoutMs = (value: string): number => {
  const match = printTimeoutPattern.exec(value.trim());
  if (!match) {
    return 10 * 60_000;
  }
  const amount = Number(match[1]);
  if (match[2] === "h") {
    return amount * 3_600_000;
  }
  return match[2] === "m" ? amount * 60_000 : amount * 1000;
};

export interface AgyAdapterOptions {
  /** Override for agy's conversation cache path (tests). */
  readonly cachePath?: string;
  /** Environment for spawned agy processes; defaults to process.env. */
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly eventStore?: ProviderEventStore;
  /** Absolute path to the agy binary; defaults to PATH/`~/.local/bin` lookup. */
  readonly executable?: string;
  /** Value for `--print-timeout`; defaults to "10m". */
  readonly printTimeout?: string;
  readonly projectRoots?: readonly string[];
  readonly sessionControlStore?: SessionControlStore;
  /** Injectable spawn so tests can supply scripted fake processes. */
  readonly spawnFn?: AgySpawnFn;
}

interface AgySessionRecord {
  activity: SessionActivity;
  conversationId: string | null;
  readonly cwd: string;
  readonly key: string;
  title: string;
  readonly turns: MutableTurn[];
  updatedAt: number;
}

interface MutableTurn {
  completedAt?: number;
  error?: string;
  readonly id: string;
  output: string;
  readonly prompt: string;
  readonly startedAt: number;
  status: AgyTurn["status"];
}

interface AgySessionState {
  readonly agent: string;
  readonly model: string;
  readonly modelProviderId: string;
}

const approvalAgents = ["sandbox", "skip-permissions"] as const;
const trailingSlash = /\/$/u;
const defaultTitle = "New Antigravity session";
const modelProviderId = "antigravity";
const stderrTailLimit = 2000;
const titleLimit = 80;
const watchdogGraceMs = 30_000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

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

const snapshotTurn = (turn: MutableTurn): AgyTurn => ({
  ...(turn.completedAt === undefined ? {} : { completedAt: turn.completedAt }),
  ...(turn.error === undefined ? {} : { error: turn.error }),
  id: turn.id,
  output: turn.output,
  prompt: turn.prompt,
  startedAt: turn.startedAt,
  status: turn.status,
});

const restoredTurn = (native: unknown): MutableTurn | undefined => {
  if (!isRecord(native)) {
    return;
  }
  const turn = Reflect.get(native, "turn");
  if (!isRecord(turn)) {
    return;
  }
  const id = Reflect.get(turn, "id");
  const output = Reflect.get(turn, "output");
  const prompt = Reflect.get(turn, "prompt");
  const startedAt = Reflect.get(turn, "startedAt");
  const status = Reflect.get(turn, "status");
  if (
    typeof id !== "string" ||
    typeof output !== "string" ||
    typeof prompt !== "string" ||
    typeof startedAt !== "number" ||
    (status !== "completed" && status !== "failed")
  ) {
    return;
  }
  const completedAt = Reflect.get(turn, "completedAt");
  const error = Reflect.get(turn, "error");
  return {
    ...(typeof completedAt === "number" ? { completedAt } : {}),
    ...(typeof error === "string" ? { error } : {}),
    id,
    output,
    prompt,
    startedAt,
    status,
  };
};

export class AgyAdapter implements HarnessAdapter {
  readonly manifest = agyManifest;
  readonly #archivedCacheKeys = new Set<string>();
  readonly #cachePath: string;
  readonly #children = new Map<string, AgyChildProcess>();
  readonly #configuredRoots: readonly string[];
  readonly #env: Readonly<Record<string, string | undefined>>;
  readonly #executable: string | undefined;
  readonly #hub: AgyEventHub;
  readonly #printTimeout: string;
  readonly #records = new Map<string, AgySessionRecord>();
  readonly #sessionControlStore: SessionControlStore | undefined;
  readonly #spawnFn: AgySpawnFn;
  readonly #states = new Map<string, AgySessionState>();

  constructor(options: AgyAdapterOptions = {}) {
    this.#cachePath = options.cachePath ?? agyConversationsCachePath();
    this.#configuredRoots = [
      ...new Set(
        (options.projectRoots ?? [process.cwd()]).map((path) => resolve(path))
      ),
    ];
    this.#env = options.env ?? process.env;
    this.#executable = options.executable;
    this.#hub = new AgyEventHub(options.eventStore);
    this.#printTimeout = options.printTimeout ?? AGY_PRINT_TIMEOUT;
    this.#sessionControlStore = options.sessionControlStore;
    this.#spawnFn = options.spawnFn ?? defaultSpawn;
  }

  dispose(): Promise<void> {
    for (const child of this.#children.values()) {
      child.kill("SIGTERM");
    }
    this.#children.clear();
    return Promise.resolve();
  }

  health(): Promise<{ readonly healthy: boolean; readonly version?: string }> {
    const executable = this.#resolveExecutable();
    return Promise.resolve({
      healthy: isAbsolute(executable) && existsSync(executable),
    });
  }

  listProjects(): Promise<readonly ProjectSummary[]> {
    const roots = new Map<string, string | null>(
      this.#configuredRoots.map((path) => [path, null])
    );
    for (const [cwd, conversationId] of listAgyConversationWorkspaces(
      this.#cachePath
    )) {
      roots.set(resolve(cwd), conversationId);
    }
    for (const record of this.#records.values()) {
      if (!roots.has(record.cwd)) {
        roots.set(record.cwd, record.conversationId);
      }
    }
    return Promise.resolve(
      [...roots.entries()]
        .map(([path, lastConversationId]) => ({
          harnessId: agyHarnessId,
          id: agyProjectId(path),
          name: agyProjectName(path),
          native: { lastConversationId, path },
          path,
        }))
        .sort((left, right) => left.name.localeCompare(right.name))
    );
  }

  listSessions(projectId?: string): Promise<readonly SessionSummary[]> {
    const cwd = projectId ? resolve(agyProjectPath(projectId)) : undefined;
    const summaries: SessionSummary[] = [];
    const coveredConversations = new Set<string>();
    for (const record of this.#records.values()) {
      if (cwd && record.cwd !== cwd) {
        continue;
      }
      if (record.conversationId) {
        coveredConversations.add(`${record.cwd}\n${record.conversationId}`);
      }
      summaries.push(this.#summaryFor(record));
    }
    for (const [workspace, conversationId] of listAgyConversationWorkspaces(
      this.#cachePath
    )) {
      const resolved = resolve(workspace);
      if (cwd && resolved !== cwd) {
        continue;
      }
      if (coveredConversations.has(`${resolved}\n${conversationId}`)) {
        continue;
      }
      const key = agyCachedSessionKey(resolved, conversationId);
      if (this.#archivedCacheKeys.has(key) || this.#records.has(key)) {
        continue;
      }
      summaries.push({
        activity: "idle",
        controls: { status: "inventory" },
        harnessId: agyHarnessId,
        id: agySessionId(key),
        native: { conversationId, cwd: resolved },
        projectId: agyProjectId(resolved),
        title: `Antigravity conversation ${conversationId.slice(0, 8)}`,
      });
    }
    return Promise.resolve(summaries);
  }

  createSession(input: CreateSessionInput): Promise<SessionSummary> {
    const cwd = resolve(agyProjectPath(input.projectId));
    const key = agyLiveSessionKey(randomUUID());
    const record: AgySessionRecord = {
      activity: "idle",
      conversationId: null,
      cwd,
      key,
      title: defaultTitle,
      turns: [],
      updatedAt: Date.now(),
    };
    this.#records.set(key, record);
    this.#writeState(key, {
      agent: "sandbox",
      model: DEFAULT_AGY_MODEL,
      modelProviderId,
    });
    this.#emit(record, "session.updated", { reason: "created" });
    return Promise.resolve(this.#summaryFor(record));
  }

  archiveSession(input: ArchiveSessionInput): Promise<void> {
    const key = agySessionKey(input.sessionId);
    this.#children.get(key)?.kill("SIGTERM");
    this.#children.delete(key);
    this.#records.delete(key);
    this.#states.delete(key);
    this.#sessionControlStore?.delete("agy", input.sessionId);
    if (decodeCachedSessionKey(key)) {
      this.#archivedCacheKeys.add(key);
    }
    return Promise.resolve();
  }

  renameSession(input: RenameSessionInput): Promise<SessionSummary> {
    const record = this.#ensureRecord(input.sessionId);
    record.title = input.title;
    record.updatedAt = Date.now();
    this.#emit(record, "session.updated", { title: input.title });
    return Promise.resolve(this.#summaryFor(record));
  }

  listTimeline(sessionId: string, olderCursor?: string): Promise<TimelinePage> {
    if (olderCursor) {
      return Promise.resolve({ items: [] });
    }
    const record = this.#ensureRecord(sessionId);
    return Promise.resolve({
      items: mapAgyTurns(
        agySessionId(record.key),
        record.turns.map(snapshotTurn)
      ),
    });
  }

  async bootstrapSession(sessionId: string): Promise<SessionBootstrap> {
    const record = this.#ensureRecord(sessionId);
    const timeline = await this.listTimeline(sessionId);
    return { session: this.#summaryFor(record), timeline };
  }

  /**
   * Start one `agy --print` turn. Resolves once the process is spawned; the
   * turn's progress is streamed through subscribe() and completion is marked
   * by a `turn.completed` event, mirroring the streaming providers.
   */
  sendTurn(input: SendTurnInput): Promise<void> {
    const record = this.#ensureRecord(input.sessionId);
    if (this.#children.has(record.key)) {
      return Promise.reject(
        new Error(`agy session already has a running turn: ${input.sessionId}`)
      );
    }
    const state = this.#stateFor(record.key);
    const args = buildAgyArgs({
      addDirs: [record.cwd],
      conversationId: record.conversationId,
      model: state.model,
      printTimeout: this.#printTimeout,
      prompt: input.text,
      skipPermissions: state.agent === "skip-permissions",
    });
    // Until this session has pinned a conversation, snapshot the cwd cache so
    // the post-turn entry can be attributed: changed -> our turn wrote it;
    // unchanged -> a leftover from another session, not ours to adopt
    // (happy-cli/src/agy/AgyBackend.ts:113-117, 170-191).
    const preTurnCacheId =
      record.conversationId === null
        ? readAgyConversationId(record.cwd, this.#cachePath)
        : null;
    const turn: MutableTurn = {
      id: `turn-${randomUUID()}`,
      output: "",
      prompt: input.text,
      startedAt: Date.now(),
      status: "running",
    };
    record.turns.push(turn);
    record.activity = "busy";
    record.updatedAt = turn.startedAt;
    if (record.title === defaultTitle) {
      record.title =
        input.text.split("\n")[0]?.trim().slice(0, titleLimit) || defaultTitle;
    }
    this.#emit(record, "turn.started", { turn: snapshotTurn(turn) });

    const child = this.#spawnFn(this.#resolveExecutable(), args, {
      cwd: record.cwd,
      env: this.#env,
    });
    this.#children.set(record.key, child);

    let settled = false;
    let stderrTail = "";
    const watchdog = setTimeout(() => {
      child.kill("SIGKILL");
    }, parsePrintTimeoutMs(this.#printTimeout) + watchdogGraceMs);
    watchdog.unref?.();

    const finish = (status: "completed" | "failed", error?: string) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(watchdog);
      if (this.#children.get(record.key) === child) {
        this.#children.delete(record.key);
      }
      // Pin the conversation this session's first turn created so later turns
      // resume it via --conversation. Runs on failed turns too: agy may have
      // created the conversation before the turn errored
      // (happy-cli/src/agy/AgyBackend.ts:174-191).
      if (record.conversationId === null) {
        const conversationId = readAgyConversationId(
          record.cwd,
          this.#cachePath
        );
        if (conversationId && conversationId !== preTurnCacheId) {
          record.conversationId = conversationId;
          this.#emit(record, "session.updated", { conversationId });
        }
      }
      turn.status = status;
      turn.completedAt = Date.now();
      if (error !== undefined) {
        turn.error = error;
      }
      record.activity = "idle";
      record.updatedAt = turn.completedAt;
      this.#emit(record, "turn.completed", { turn: snapshotTurn(turn) });
    };

    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      if (!chunk) {
        return;
      }
      turn.output += chunk;
      record.updatedAt = Date.now();
      this.#emit(record, "timeline.item.upserted", {
        delta: chunk,
        turnId: turn.id,
      });
    });
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk) => {
      stderrTail = `${stderrTail}${chunk}`.slice(-stderrTailLimit);
    });
    child.on("error", (error: Error & { readonly code?: string }) => {
      const detail =
        error.code === "ENOENT"
          ? "agy executable not found. Install the Antigravity CLI, or set VIBEPAD_AGY_BIN to its absolute path (tried PATH and ~/.local/bin/agy)."
          : error.message;
      finish("failed", detail);
    });
    child.on("close", (code) => {
      if (code === 0) {
        finish("completed");
        return;
      }
      const stderrSuffix = stderrTail.trim() ? `: ${stderrTail.trim()}` : "";
      finish("failed", `agy exited with code ${code ?? "null"}${stderrSuffix}`);
    });
    return Promise.resolve();
  }

  abortTurn(sessionId: string): Promise<void> {
    const key = agySessionKey(sessionId);
    const child = this.#children.get(key);
    if (!child) {
      return Promise.reject(
        new Error(`agy session has no active turn: ${sessionId}`)
      );
    }
    child.kill("SIGTERM");
    return Promise.resolve();
  }

  listCatalog(_projectId: string): Promise<ProviderCatalog> {
    return Promise.resolve({
      agents: [
        {
          description:
            "Run agy with --sandbox; approvals are governed by agy's own settings.json.",
          hidden: false,
          id: "sandbox",
          mode: "primary",
          native: { flag: "--sandbox" },
        },
        {
          description:
            "Run agy with --dangerously-skip-permissions; every tool is auto-approved.",
          hidden: false,
          id: "skip-permissions",
          mode: "primary",
          native: { flag: "--dangerously-skip-permissions" },
        },
      ],
      commands: [],
      models: AGY_MODELS.map((name) => ({
        enabled: true,
        id: name,
        name,
        native: { displayName: name },
        providerId: modelProviderId,
        status: "active",
        variants: [],
      })),
      providers: [
        {
          disabled: false,
          id: modelProviderId,
          name: "Google Antigravity",
          native: { id: modelProviderId },
        },
      ],
      skills: [],
    });
  }

  selectModel(input: SelectModelInput): Promise<SessionSummary> {
    const record = this.#ensureRecord(input.sessionId);
    if (!AGY_MODELS.some((name) => name === input.id)) {
      return Promise.reject(
        new Error(
          `agy model not found: ${input.id}. agy expects the full display name printed by \`agy models\`.`
        )
      );
    }
    this.#writeState(record.key, {
      ...this.#stateFor(record.key),
      model: input.id,
      modelProviderId: input.providerId,
    });
    record.updatedAt = Date.now();
    this.#emit(record, "session.updated", { model: input.id });
    return Promise.resolve(this.#summaryFor(record));
  }

  selectAgent(input: SelectAgentInput): Promise<SessionSummary> {
    const record = this.#ensureRecord(input.sessionId);
    if (!approvalAgents.some((agent) => agent === input.agentId)) {
      return Promise.reject(
        new Error(`agy approval policy not found: ${input.agentId}`)
      );
    }
    this.#writeState(record.key, {
      ...this.#stateFor(record.key),
      agent: input.agentId,
    });
    record.updatedAt = Date.now();
    this.#emit(record, "session.updated", { agent: input.agentId });
    return Promise.resolve(this.#summaryFor(record));
  }

  listInteractions(_sessionId: string): Promise<readonly PendingInteraction[]> {
    // agy --print cannot surface approval or question prompts
    // (happy-cli/src/agy/cliArgs.ts:11-16).
    return Promise.resolve([]);
  }

  respondPermission(_input: RespondPermissionInput): Promise<void> {
    return Promise.reject(
      new Error(
        "agy print mode has no permission protocol; approvals are governed by the --sandbox / --dangerously-skip-permissions policy."
      )
    );
  }

  respondQuestion(_input: RespondQuestionInput): Promise<void> {
    return Promise.reject(
      new Error("agy print mode has no interactive question protocol.")
    );
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
    const bytes = await readFile(absolute);
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
    return Promise.reject(
      new Error(
        "agy exposes no change-tracking surface; file.status is unsupported."
      )
    );
  }

  listServices(_projectId: string): Promise<readonly ServiceSummary[]> {
    return Promise.resolve([]);
  }

  async *subscribe(
    sessionId: string,
    signal?: AbortSignal,
    afterCursor?: string
  ): AsyncIterable<ProviderEvent> {
    this.#ensureRecord(sessionId);
    yield* this.#hub.subscribe(sessionId, signal, afterCursor);
  }

  #emit(
    record: AgySessionRecord,
    kind: Parameters<AgyEventHub["emit"]>[0]["kind"],
    native: unknown
  ) {
    this.#hub.emit({
      kind,
      native,
      projectId: agyProjectId(record.cwd),
      sessionId: agySessionId(record.key),
    });
  }

  /**
   * Materialize the record for a session id. Live sessions exist only in
   * memory; cache-derived sessions (whose key encodes cwd + conversation id)
   * are rebuilt on demand, restoring completed turns and the latest title
   * from the persisted event store.
   */
  #ensureRecord(sessionId: string): AgySessionRecord {
    const key = agySessionKey(sessionId);
    const existing = this.#records.get(key);
    if (existing) {
      return existing;
    }
    const decoded = decodeCachedSessionKey(key);
    if (!decoded) {
      throw new Error(
        `agy session not found: ${sessionId}. Live agy sessions do not survive a host restart; resume the workspace's last conversation instead.`
      );
    }
    const record: AgySessionRecord = {
      activity: "idle",
      conversationId: decoded.conversationId,
      cwd: decoded.cwd,
      key,
      title: `Antigravity conversation ${decoded.conversationId.slice(0, 8)}`,
      turns: [],
      updatedAt: Date.now(),
    };
    for (const event of this.#hub.persistedEvents(sessionId)) {
      if (event.kind === "turn.completed") {
        const turn = restoredTurn(event.native);
        if (turn) {
          record.turns.push(turn);
        }
      } else if (event.kind === "session.updated" && isRecord(event.native)) {
        const title = Reflect.get(event.native, "title");
        if (typeof title === "string" && title.length > 0) {
          record.title = title;
        }
      }
    }
    this.#records.set(key, record);
    return record;
  }

  #projectFilePath(projectId: string, path: string) {
    const root = resolve(agyProjectPath(projectId));
    const candidate = resolve(root, path);
    if (
      !isAbsolute(candidate) ||
      (candidate !== root && !candidate.startsWith(`${root}${sep}`))
    ) {
      throw new Error(`File path escapes agy project: ${path}`);
    }
    return candidate;
  }

  #resolveExecutable() {
    return this.#executable ?? resolveAgyBin(this.#env);
  }

  #stateFor(key: string): AgySessionState {
    const current = this.#states.get(key);
    if (current) {
      return current;
    }
    const controls = this.#sessionControlStore?.read("agy", agySessionId(key));
    const restored: AgySessionState = {
      agent: controls?.agent ?? "sandbox",
      model: controls?.model?.id ?? DEFAULT_AGY_MODEL,
      modelProviderId: controls?.model?.providerId ?? modelProviderId,
    };
    this.#states.set(key, restored);
    return restored;
  }

  #summaryFor(record: AgySessionRecord): ReadySessionSummary {
    const state = this.#stateFor(record.key);
    return {
      activity: record.activity,
      controls: {
        agent: state.agent,
        model: { id: state.model, providerId: state.modelProviderId },
        status: "ready",
      },
      harnessId: agyHarnessId,
      id: agySessionId(record.key),
      native: {
        conversationId: record.conversationId,
        cwd: record.cwd,
        turnCount: record.turns.length,
      },
      projectId: agyProjectId(record.cwd),
      title: record.title,
      updatedAt: new Date(record.updatedAt).toISOString(),
    };
  }

  #writeState(key: string, state: AgySessionState) {
    this.#states.set(key, state);
    this.#sessionControlStore?.write("agy", agySessionId(key), {
      agent: state.agent,
      model: { id: state.model, providerId: state.modelProviderId },
      status: "ready",
    });
  }
}
