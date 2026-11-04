import type {
  ProviderEvent,
  ProviderEventStore,
} from "@vibepad/protocol/events";
import type {
  ReadySessionControls,
  SessionControlStore,
} from "@vibepad/protocol/provider";
import { expect, it as test, vi } from "vitest";

import { ClaudeCodeAdapter } from "./adapter";
import type { ClaudeCodeDetection } from "./detect";
import {
  claudeCodeNativeSessionId,
  claudeCodeProjectId,
  claudeCodeSessionId,
} from "./ids";
import { claudeCodeCapabilityOperations, claudeCodeManifest } from "./manifest";
import { AsyncMessageQueue } from "./runtime";
import type {
  ClaudeCanUseTool,
  ClaudeCodeSdk,
  ClaudePermissionResult,
  ClaudeQueryHandle,
  ClaudeQueryOptions,
  ClaudeSessionInfo,
  ClaudeUserMessageInput,
} from "./sdk";

const projectRoot = "/home/simon/projects/demo";
const projectId = claudeCodeProjectId(projectRoot);

const detection: ClaudeCodeDetection = {
  available: true,
  executablePath: "/usr/bin/claude",
  source: "path",
  version: "2.1.218",
};

class MemoryEventStore implements ProviderEventStore {
  readonly events: ProviderEvent[] = [];

  append(event: ProviderEvent): void {
    this.events.push(event);
  }

  latestSequence(providerId: string): number {
    return this.events.reduce(
      (latest, event) =>
        event.providerId === providerId
          ? Math.max(latest, event.sequence)
          : latest,
      0
    );
  }

  list(
    providerId: string,
    sessionId: string,
    afterSequence = 0
  ): readonly ProviderEvent[] {
    return this.events.filter(
      (event) =>
        event.providerId === providerId &&
        event.sessionId === sessionId &&
        event.sequence > afterSequence
    );
  }

  kinds(sessionId: string): readonly string[] {
    return this.events
      .filter((event) => event.sessionId === sessionId)
      .map((event) => event.kind);
  }
}

class MemoryControlStore implements SessionControlStore {
  readonly controls = new Map<string, ReadySessionControls>();

  delete(providerId: string, sessionId: string): void {
    this.controls.delete(`${providerId}:${sessionId}`);
  }

  read(
    providerId: string,
    sessionId: string
  ): ReadySessionControls | undefined {
    return this.controls.get(`${providerId}:${sessionId}`);
  }

  write(
    providerId: string,
    sessionId: string,
    controls: ReadySessionControls
  ): void {
    this.controls.set(`${providerId}:${sessionId}`, controls);
  }
}

class FakeQuery implements ClaudeQueryHandle {
  closed = false;
  interrupts = 0;
  readonly models: string[] = [];
  readonly modes: string[] = [];
  readonly options: ClaudeQueryOptions;
  readonly output = new AsyncMessageQueue<unknown>();
  readonly sent: string[] = [];

  constructor(
    options: ClaudeQueryOptions,
    prompt: AsyncIterable<ClaudeUserMessageInput>,
    onUserMessage?: (query: FakeQuery, text: string) => void
  ) {
    this.options = options;
    (async () => {
      for await (const message of prompt) {
        this.sent.push(message.message.content);
        onUserMessage?.(this, message.message.content);
      }
    })().catch(() => undefined);
  }

  [Symbol.asyncIterator](): AsyncIterator<unknown> {
    return this.output[Symbol.asyncIterator]();
  }

  close(): void {
    this.closed = true;
    this.output.end();
  }

  interrupt(): Promise<unknown> {
    this.interrupts += 1;
    return Promise.resolve(undefined);
  }

  setModel(model?: string): Promise<void> {
    this.models.push(model ?? "");
    return Promise.resolve();
  }

  setPermissionMode(mode: string): Promise<void> {
    this.modes.push(mode);
    return Promise.resolve();
  }
}

class FakeSdk implements ClaudeCodeSdk {
  readonly messagesBySession = new Map<string, unknown[]>();
  onUserMessage: ((query: FakeQuery, text: string) => void) | undefined;
  readonly queries: FakeQuery[] = [];
  readonly renames: { dir?: string; sessionId: string; title: string }[] = [];
  sessions: ClaudeSessionInfo[] = [];

  getSessionMessages(
    sessionId: string,
    _options?: { dir?: string; includeSystemMessages?: boolean }
  ): Promise<readonly unknown[]> {
    return Promise.resolve(this.messagesBySession.get(sessionId) ?? []);
  }

  listSessions(options?: {
    dir?: string;
    limit?: number;
  }): Promise<readonly ClaudeSessionInfo[]> {
    return Promise.resolve(
      options?.dir
        ? this.sessions.filter((session) => session.cwd === options.dir)
        : this.sessions
    );
  }

  query(params: {
    options: ClaudeQueryOptions;
    prompt: AsyncIterable<ClaudeUserMessageInput>;
  }): ClaudeQueryHandle {
    const query = new FakeQuery(
      params.options,
      params.prompt,
      this.onUserMessage
    );
    this.queries.push(query);
    return query;
  }

  renameSession(
    sessionId: string,
    title: string,
    options?: { dir?: string }
  ): Promise<void> {
    this.renames.push({
      ...(options?.dir ? { dir: options.dir } : {}),
      sessionId,
      title,
    });
    return Promise.resolve();
  }
}

const createAdapter = () => {
  const controlStore = new MemoryControlStore();
  const eventStore = new MemoryEventStore();
  const sdk = new FakeSdk();
  const adapter = new ClaudeCodeAdapter({
    detection,
    eventStore,
    projectRoots: [projectRoot],
    sdk,
    sessionControlStore: controlStore,
  });
  return { adapter, controlStore, eventStore, sdk };
};

const diskSession = (
  sessionId: string,
  overrides: Partial<ClaudeSessionInfo> = {}
): ClaudeSessionInfo => ({
  createdAt: 1_753_264_000_000,
  cwd: projectRoot,
  lastModified: 1_753_264_800_000,
  sessionId,
  summary: "Investigate flaky test",
  ...overrides,
});

test("declares the claude-code manifest the client already expects", () => {
  expect(claudeCodeManifest.id).toBe("claude-code");
  expect(claudeCodeManifest.displayName).toBe("Claude Code");
  expect(claudeCodeManifest.protocolVersion).toBe(1);
  for (const operation of Object.values(claudeCodeCapabilityOperations)) {
    expect(typeof Reflect.get(ClaudeCodeAdapter.prototype, operation)).toBe(
      "function"
    );
  }
});

test("reports health from detection without invoking anything", async () => {
  const { adapter } = createAdapter();
  await expect(adapter.health()).resolves.toEqual({
    healthy: true,
    version: "2.1.218",
  });

  const missing = new ClaudeCodeAdapter({
    detection: { available: false, source: "none" },
    projectRoots: [projectRoot],
    sdk: new FakeSdk(),
  });
  await expect(missing.health()).resolves.toEqual({ healthy: false });
});

test("derives projects from configured roots and session working directories", async () => {
  const { adapter, sdk } = createAdapter();
  sdk.sessions = [
    diskSession("11111111-1111-4111-8111-111111111111"),
    diskSession("22222222-2222-4222-8222-222222222222", {
      cwd: "/home/simon/projects/other",
    }),
  ];

  const projects = await adapter.listProjects();

  expect(projects.map((project) => project.path)).toEqual([
    projectRoot,
    "/home/simon/projects/other",
  ]);
  expect(projects[0]?.harnessId).toBe("claude-code");
  expect(projects[0]?.id).toBe(projectId);
});

test("creates a cwd-scoped draft session and lists it alongside disk sessions", async () => {
  const { adapter, controlStore, sdk } = createAdapter();
  sdk.sessions = [diskSession("11111111-1111-4111-8111-111111111111")];

  const created = await adapter.createSession({ projectId });
  expect(created.harnessId).toBe("claude-code");
  expect(created.projectId).toBe(projectId);
  expect(created.controls).toEqual({ agent: "default", status: "ready" });
  expect(controlStore.read("claude-code", created.id)).toEqual({
    agent: "default",
    status: "ready",
  });

  const sessions = await adapter.listSessions(projectId);
  expect(sessions.map(({ id }) => id)).toContain(created.id);
  const persisted = sessions.find(
    (session) =>
      session.id === claudeCodeSessionId("11111111-1111-4111-8111-111111111111")
  );
  expect(persisted?.controls).toEqual({ status: "inventory" });
  expect(persisted?.title).toBe("Investigate flaky test");
});

test("launches a new SDK session on the first turn with the pre-assigned id", async () => {
  const { adapter, eventStore, sdk } = createAdapter();
  sdk.onUserMessage = (activeQuery) => {
    activeQuery.output.push({
      message: {
        content: [{ text: "Done.", type: "text" }],
        role: "assistant",
      },
      parent_tool_use_id: null,
      session_id: claudeCodeNativeSessionId(created.id),
      type: "assistant",
      uuid: "uuid-live-1",
    });
    activeQuery.output.push({
      result: "Done.",
      subtype: "success",
      type: "result",
      uuid: "uuid-result-1",
    });
  };
  const created = await adapter.createSession({ projectId });
  const nativeId = claudeCodeNativeSessionId(created.id);

  await adapter.sendTurn({ sessionId: created.id, text: "Reply with ok" });

  const [query] = sdk.queries;
  if (!query) {
    throw new Error("The fake SDK never received a query");
  }
  expect(query.options).toMatchObject({
    cwd: projectRoot,
    sessionId: nativeId,
  });
  expect(query.options.resume).toBeUndefined();
  expect(query.options.canUseTool).toBeTypeOf("function");

  await vi.waitFor(() => {
    expect(eventStore.kinds(created.id)).toContain("turn.completed");
  });
  expect(query.sent).toEqual(["Reply with ok"]);
  expect(eventStore.kinds(created.id)).toEqual(
    expect.arrayContaining([
      "session.updated",
      "turn.started",
      "timeline.item.upserted",
      "turn.completed",
    ])
  );

  // The SDK stream never echoes plain user messages, so the adapter records
  // a synthetic user entry at send time; the live assistant message is
  // served before either reaches disk.
  const timeline = await adapter.listTimeline(created.id);
  expect(timeline.items).toHaveLength(2);
  expect(timeline.items[0]).toMatchObject({ role: "user" });
  expect(timeline.items[0]?.parts[0]).toMatchObject({
    text: "Reply with ok",
    type: "text",
  });
  expect(timeline.items[1]?.id).toBe("uuid-live-1");
});

test("resumes persisted sessions by native id and merges disk history with live items", async () => {
  const { adapter, sdk } = createAdapter();
  const nativeId = "33333333-3333-4333-8333-333333333333";
  sdk.sessions = [diskSession(nativeId)];
  sdk.messagesBySession.set(nativeId, [
    {
      message: { content: "What changed?", role: "user" },
      parent_tool_use_id: null,
      type: "user",
      uuid: "uuid-disk-1",
    },
  ]);
  sdk.onUserMessage = (activeQuery) => {
    activeQuery.output.push({
      message: {
        content: [{ text: "Two files changed.", type: "text" }],
        role: "assistant",
      },
      parent_tool_use_id: null,
      session_id: nativeId,
      type: "assistant",
      uuid: "uuid-live-2",
    });
    activeQuery.output.push({ subtype: "success", type: "result", uuid: "r2" });
  };
  const sessionId = claudeCodeSessionId(nativeId);

  await adapter.sendTurn({ sessionId, text: "Summarize the diff" });

  const [query] = sdk.queries;
  if (!query) {
    throw new Error("The fake SDK never received a query");
  }
  expect(query.options).toMatchObject({ cwd: projectRoot, resume: nativeId });
  expect(query.options.sessionId).toBeUndefined();

  await vi.waitFor(async () => {
    const timeline = await adapter.listTimeline(sessionId);
    // Disk history first, then the synthetic user entry for the new turn,
    // then the live assistant reply.
    expect(timeline.items).toHaveLength(3);
    expect(timeline.items[0]?.id).toBe("uuid-disk-1");
    expect(timeline.items[1]).toMatchObject({ role: "user" });
    expect(timeline.items[1]?.parts[0]).toMatchObject({
      text: "Summarize the diff",
      type: "text",
    });
    expect(timeline.items[2]?.id).toBe("uuid-live-2");
  });
});

test("keeps the final assistant text when stream twins share uuids with the transcript", async () => {
  // Regression for the 2026-07-23 live run (session 123c7e45, project dir
  // -tmp-vibepad-claude-live-47ELoZ): Claude answers "Reply with exactly:
  // ok" as TWO assistant messages — a thinking-only message, then a
  // separate text message — and the stream twins share uuids with the disk
  // transcript. The merge must keep exactly one copy of each and the "ok"
  // text must survive.
  const { adapter, sdk } = createAdapter();
  const created = await adapter.createSession({ projectId });
  const nativeId = claudeCodeNativeSessionId(created.id);
  const thinkingTwin = {
    message: {
      content: [
        {
          signature: "elided",
          thinking: 'The user is asking me to reply with exactly "ok". Simple.',
          type: "thinking",
        },
      ],
      role: "assistant",
    },
    parent_agent_id: null,
    parent_tool_use_id: null,
    session_id: nativeId,
    timestamp: "2026-07-24T03:10:01.000Z",
    type: "assistant",
    uuid: "c562c239-9002-436c-8e8f-ca3d9878c82a",
  };
  const textTwin = {
    message: {
      content: [{ text: "ok", type: "text" }],
      role: "assistant",
    },
    parent_agent_id: null,
    parent_tool_use_id: null,
    session_id: nativeId,
    timestamp: "2026-07-24T03:10:02.000Z",
    type: "assistant",
    uuid: "49ac7594-e57c-478e-abba-ca6fbff76414",
  };
  sdk.onUserMessage = (activeQuery) => {
    activeQuery.output.push(thinkingTwin);
    activeQuery.output.push(textTwin);
    activeQuery.output.push({ subtype: "success", type: "result", uuid: "r6" });
  };

  await adapter.sendTurn({
    sessionId: created.id,
    text: "Reply with exactly: ok",
  });
  await vi.waitFor(async () => {
    const streaming = await adapter.listTimeline(created.id);
    expect(streaming.items).toHaveLength(3);
  });

  // The CLI flushes the transcript: user prompt plus BOTH assistant
  // messages, with the same uuids the stream already delivered.
  sdk.messagesBySession.set(nativeId, [
    {
      message: { content: "Reply with exactly: ok", role: "user" },
      parent_agent_id: null,
      parent_tool_use_id: null,
      session_id: nativeId,
      timestamp: "2026-07-24T03:10:00.000Z",
      type: "user",
      uuid: "953c8b96-8e0e-43b5-a2ff-1d528aea2cb1",
    },
    thinkingTwin,
    textTwin,
  ]);

  const timeline = await adapter.listTimeline(created.id);
  expect(timeline.items.map(({ id }) => id)).toEqual([
    "953c8b96-8e0e-43b5-a2ff-1d528aea2cb1",
    "c562c239-9002-436c-8e8f-ca3d9878c82a",
    "49ac7594-e57c-478e-abba-ca6fbff76414",
  ]);
  // First assistant item is reasoning-only — consumers must scan ALL
  // assistant items for reply text.
  expect(timeline.items[1]?.parts).toEqual([
    expect.objectContaining({ type: "reasoning" }),
  ]);
  expect(timeline.items[2]?.parts).toEqual([
    expect.objectContaining({ text: "ok", type: "text" }),
  ]);
});

test("replaces synthetic user entries once their transcript twins reach disk", async () => {
  const { adapter, sdk } = createAdapter();
  sdk.onUserMessage = (activeQuery) => {
    activeQuery.output.push({ subtype: "success", type: "result", uuid: "r5" });
  };
  const created = await adapter.createSession({ projectId });
  const nativeId = claudeCodeNativeSessionId(created.id);

  await adapter.sendTurn({ sessionId: created.id, text: "Hello there" });

  // Before the transcript lands, the synthetic entry represents the turn.
  const before = await adapter.listTimeline(created.id);
  expect(before.items).toHaveLength(1);
  expect(before.items[0]?.parts[0]).toMatchObject({ text: "Hello there" });

  // Once the CLI flushes the session file, the disk twin wins and the
  // synthetic entry is dropped — no duplicate user items.
  sdk.messagesBySession.set(nativeId, [
    {
      message: { content: "Hello there", role: "user" },
      parent_tool_use_id: null,
      timestamp: "2026-07-23T11:00:00.000Z",
      type: "user",
      uuid: "uuid-disk-twin",
    },
  ]);
  const after = await adapter.listTimeline(created.id);
  expect(after.items.map(({ id }) => id)).toEqual(["uuid-disk-twin"]);
});

test("aborts an active turn via the SDK and refuses when no runtime exists", async () => {
  const { adapter, sdk } = createAdapter();
  const created = await adapter.createSession({ projectId });
  await adapter.sendTurn({ sessionId: created.id, text: "Long task" });

  await adapter.abortTurn(created.id);
  expect(sdk.queries[0]?.interrupts).toBe(1);

  await expect(
    adapter.abortTurn(
      claudeCodeSessionId("44444444-4444-4444-8444-444444444444")
    )
  ).rejects.toThrow("no active turn");
});

test("routes canUseTool asks through VibePad interactions and back", async () => {
  const { adapter, eventStore, sdk } = createAdapter();
  const results: ClaudePermissionResult[] = [];
  sdk.onUserMessage = (query) => {
    const canUseTool = query.options.canUseTool as ClaudeCanUseTool;
    canUseTool(
      "Bash",
      { command: "bun test" },
      { signal: new AbortController().signal, toolUseID: "toolu_live" }
    )
      .then((result) => {
        results.push(result);
        query.output.push({ subtype: "success", type: "result", uuid: "r3" });
      })
      .catch(() => undefined);
  };
  const created = await adapter.createSession({ projectId });

  await adapter.sendTurn({ sessionId: created.id, text: "Run the tests" });

  await vi.waitFor(async () => {
    const interactions = await adapter.listInteractions(created.id);
    expect(interactions).toHaveLength(1);
  });
  const [interaction] = await adapter.listInteractions(created.id);
  expect(interaction).toMatchObject({
    id: "toolu_live",
    kind: "permission",
    resources: ["bun test"],
    sessionId: created.id,
  });
  expect(eventStore.kinds(created.id)).toContain("permission.requested");

  const sessions = await adapter.listSessions(projectId);
  expect(
    sessions.find((session) => session.id === created.id)?.pendingInput
  ).toBe("permission");

  await adapter.respondPermission({
    decision: "once",
    requestId: "toolu_live",
    sessionId: created.id,
  });
  await vi.waitFor(() => {
    expect(results).toHaveLength(1);
  });
  expect(results[0]).toEqual({
    behavior: "allow",
    updatedInput: { command: "bun test" },
  });
  expect(eventStore.kinds(created.id)).toContain("permission.resolved");
  await expect(adapter.listInteractions(created.id)).resolves.toHaveLength(0);
});

test("applies model and permission-mode selection to the store and live runtime", async () => {
  const { adapter, controlStore, sdk } = createAdapter();
  const created = await adapter.createSession({ projectId });
  await adapter.sendTurn({ sessionId: created.id, text: "hi" });

  await adapter.selectModel({
    id: "haiku",
    providerId: "anthropic",
    sessionId: created.id,
  });
  await adapter.selectAgent({ agentId: "acceptEdits", sessionId: created.id });

  expect(controlStore.read("claude-code", created.id)).toEqual({
    agent: "acceptEdits",
    model: { id: "haiku", providerId: "anthropic" },
    status: "ready",
  });
  expect(sdk.queries[0]?.models).toEqual(["haiku"]);
  expect(sdk.queries[0]?.modes).toEqual(["acceptEdits"]);

  await expect(
    adapter.selectAgent({ agentId: "not-a-mode", sessionId: created.id })
  ).rejects.toThrow("permission mode not found");
});

test("uses stored controls when launching a runtime", async () => {
  const { adapter, controlStore, sdk } = createAdapter();
  const nativeId = "55555555-5555-4555-8555-555555555555";
  sdk.sessions = [diskSession(nativeId)];
  controlStore.write("claude-code", claudeCodeSessionId(nativeId), {
    agent: "plan",
    model: { id: "opus", providerId: "anthropic" },
    status: "ready",
  });

  await adapter.sendTurn({
    sessionId: claudeCodeSessionId(nativeId),
    text: "Plan the refactor",
  });

  expect(sdk.queries[0]?.options).toMatchObject({
    model: "opus",
    permissionMode: "plan",
    resume: nativeId,
  });
});

test("renames persisted sessions through the SDK and drafts locally", async () => {
  const { adapter, sdk } = createAdapter();
  const nativeId = "66666666-6666-4666-8666-666666666666";
  sdk.sessions = [diskSession(nativeId)];
  await adapter.listSessions(projectId);

  const renamed = await adapter.renameSession({
    sessionId: claudeCodeSessionId(nativeId),
    title: "Flaky test hunt",
  });
  expect(sdk.renames).toEqual([
    { dir: projectRoot, sessionId: nativeId, title: "Flaky test hunt" },
  ]);
  expect(renamed.title).toBe("Flaky test hunt");

  const draft = await adapter.createSession({ projectId });
  const renamedDraft = await adapter.renameSession({
    sessionId: draft.id,
    title: "Fresh start",
  });
  expect(renamedDraft.title).toBe("Fresh start");
  expect(sdk.renames).toHaveLength(1);
});

test("bootstraps a ready session and refuses archive requests", async () => {
  const { adapter, sdk } = createAdapter();
  const nativeId = "77777777-7777-4777-8777-777777777777";
  sdk.sessions = [diskSession(nativeId)];
  sdk.messagesBySession.set(nativeId, [
    {
      message: { content: "Hello", role: "user" },
      parent_tool_use_id: null,
      type: "user",
      uuid: "uuid-hello",
    },
  ]);
  const sessionId = claudeCodeSessionId(nativeId);

  const bootstrap = await adapter.bootstrapSession(sessionId);
  expect(bootstrap.session.controls.status).toBe("ready");
  expect(bootstrap.timeline.items.map(({ id }) => id)).toEqual(["uuid-hello"]);

  await expect(adapter.archiveSession({ sessionId })).rejects.toThrow(
    "cannot archive"
  );
});

test("streams provider events to subscribers from the shared hub", async () => {
  const { adapter, sdk } = createAdapter();
  sdk.onUserMessage = (query) => {
    query.output.push({ subtype: "success", type: "result", uuid: "r4" });
  };
  const created = await adapter.createSession({ projectId });
  const controller = new AbortController();
  const received: string[] = [];
  const subscription = (async () => {
    for await (const event of adapter.subscribe(
      created.id,
      controller.signal
    )) {
      received.push(event.kind);
      if (event.kind === "turn.completed") {
        controller.abort();
      }
    }
  })();

  await adapter.sendTurn({ sessionId: created.id, text: "hi" });
  await subscription;

  expect(received[0]).toBe("turn.started");
  expect(received.at(-1)).toBe("turn.completed");
});
