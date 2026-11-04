import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  ProviderEvent,
  ProviderEventStore,
} from "@vibepad/protocol/events";
import type {
  ReadySessionControls,
  SessionControlStore,
} from "@vibepad/protocol/provider";
import { expect, it as test } from "vitest";
import type { GetAccountResponse } from "../generated/v2/GetAccountResponse";
import type { ThreadStartResponse } from "../generated/v2/ThreadStartResponse";
import { CodexAdapter } from "./adapter";
import { CodexAppServerClient } from "./app-server-client";
import { codexSessionId, codexThreadId } from "./ids";
import { codexCapabilityOperations, codexManifest } from "./manifest";

const enabled = Reflect.get(process.env, "VIBEPAD_LIVE_CODEX_TESTS") === "1";
const projectDirectory =
  Reflect.get(process.env, "VIBEPAD_LIVE_PROJECT_DIR") ??
  "/home/simon/github/vibepad";

class PersistentTestEventStore implements ProviderEventStore {
  readonly #events: ProviderEvent[] = [];

  append(event: ProviderEvent): void {
    this.#events.push(event);
  }

  latestSequence(providerId: string): number {
    return this.#events.reduce(
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
    return this.#events.filter(
      (event) =>
        event.providerId === providerId &&
        event.sessionId === sessionId &&
        event.sequence > afterSequence
    );
  }
}

class PersistentTestSessionControlStore implements SessionControlStore {
  readonly #controls = new Map<string, ReadySessionControls>();

  delete(providerId: string, sessionId: string): void {
    this.#controls.delete(`${providerId}:${sessionId}`);
  }

  read(
    providerId: string,
    sessionId: string
  ): ReadySessionControls | undefined {
    return this.#controls.get(`${providerId}:${sessionId}`);
  }

  write(
    providerId: string,
    sessionId: string,
    controls: ReadySessionControls
  ): void {
    this.#controls.set(`${providerId}:${sessionId}`, controls);
  }
}

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });

const waitFor = async <Value>(
  load: () => Promise<Value>,
  matches: (value: Value) => boolean,
  label: string,
  milliseconds = 30_000
) => {
  const started = Date.now();
  while (Date.now() - started < milliseconds) {
    // biome-ignore lint/performance/noAwaitInLoops: Real Codex state is polled until it converges.
    const value = await load();
    if (matches(value)) {
      return value;
    }
    await delay(100);
  }
  throw new Error(`${label} did not converge after ${milliseconds}ms`);
};

const startDirectThread = async (
  client: CodexAppServerClient,
  params: unknown
) => {
  const startedThreadIds = new Set<string>();
  const unsubscribe = client.onNotification((notification) => {
    if (
      notification.method !== "thread/started" ||
      typeof notification.params !== "object" ||
      notification.params === null
    ) {
      return;
    }
    const thread = Reflect.get(notification.params, "thread");
    if (typeof thread !== "object" || thread === null) {
      return;
    }
    const threadId = Reflect.get(thread, "id");
    if (typeof threadId === "string") {
      startedThreadIds.add(threadId);
    }
  });
  try {
    const started = await client.request<ThreadStartResponse>(
      "thread/start",
      params
    );
    await waitFor(
      () => Promise.resolve(startedThreadIds.has(started.thread.id)),
      Boolean,
      "Codex thread/started notification"
    );
    return started;
  } finally {
    unsubscribe();
  }
};

const waitForTurnCompletion = async (
  adapter: CodexAdapter,
  sessionId: string,
  signal: AbortSignal
) => {
  for await (const event of adapter.subscribe(sessionId, signal)) {
    if (event.kind === "turn.completed") {
      return event;
    }
  }
  throw new Error("Codex event stream ended before turn completion");
};

const chooseFastModel = async (adapter: CodexAdapter, projectId: string) => {
  const catalog = await adapter.listCatalog(projectId);
  const model =
    catalog.models.find((candidate) => candidate.id === "gpt-5.6-luna") ??
    catalog.models.find((candidate) => candidate.enabled);
  if (!model) {
    throw new Error("Codex model catalog is empty");
  }
  return { catalog, model };
};

const disposeDisposableThread = async (
  client: CodexAppServerClient,
  adapter: CodexAdapter,
  sessionId: string | undefined
) => {
  try {
    if (sessionId) {
      await client.request("thread/delete", {
        threadId: codexThreadId(sessionId),
      });
    }
  } finally {
    await adapter.dispose();
  }
};

test("advertises only capabilities backed by Codex adapter operations", () => {
  for (const [capabilityId, support] of Object.entries(
    codexManifest.capabilities
  )) {
    if (support.state === "unsupported") {
      continue;
    }
    const operation =
      codexCapabilityOperations[
        capabilityId as keyof typeof codexCapabilityOperations
      ];
    expect(operation, `${capabilityId} has no adapter operation`).toBeDefined();
    expect(
      typeof Reflect.get(CodexAdapter.prototype, String(operation)),
      `${capabilityId} points to missing adapter.${operation}`
    ).toBe("function");
  }
});

test("restarts and reinitializes the real Codex app-server after its owned child exits", async () => {
  if (!enabled) {
    return;
  }

  const client = new CodexAppServerClient();
  const connectionStates: string[] = [];
  const unsubscribe = client.onConnectionState((state) => {
    connectionStates.push(`${state.kind}:${state.generation}`);
  });
  try {
    const initialized = await client.start();
    expect(initialized.userAgent).toContain("0.144.6");
    const initialGeneration = client.connectionGeneration;
    const initialProcessId = client.processId;
    expect(initialGeneration).toBeDefined();
    expect(initialProcessId).toBeDefined();
    if (!(initialGeneration && initialProcessId)) {
      return;
    }

    process.kill(initialProcessId, "SIGTERM");
    await waitFor(
      () => Promise.resolve(client.processId),
      (processId) => processId === undefined,
      "Codex app-server child exit"
    );

    const account = await client.request<GetAccountResponse>(
      "account/read",
      {},
      { retryOnDisconnect: true }
    );
    expect(Boolean(account.account) || !account.requiresOpenaiAuth).toBe(true);
    expect(client.connectionGeneration).toBeGreaterThan(initialGeneration);
    expect(client.processId).not.toBe(initialProcessId);
    expect(connectionStates).toEqual([
      `connected:${initialGeneration}`,
      `disconnected:${initialGeneration}`,
      `connected:${initialGeneration + 1}`,
    ]);
  } finally {
    unsubscribe();
    await client.dispose();
  }
}, 60_000);

test("resumes a real Codex thread after app-server restart without duplicating its turn", async () => {
  if (!enabled) {
    return;
  }

  const client = new CodexAppServerClient();
  const adapter = new CodexAdapter({
    client,
    projectRoots: [projectDirectory],
  });
  const streamController = new AbortController();
  let sessionId: string | undefined;
  try {
    const project = (await adapter.listProjects()).find(
      (candidate) => candidate.path === projectDirectory
    );
    expect(project).toBeDefined();
    if (!project) {
      return;
    }
    sessionId = (await adapter.createSession({ projectId: project.id })).id;

    const firstCompleted = waitForTurnCompletion(
      adapter,
      sessionId,
      streamController.signal
    );
    const firstMarker = `VIBEPAD_CODEX_RECONNECT_BASE_${Date.now()}`;
    const firstPrompt = `Reply with exactly ${firstMarker}. Do not use tools.`;
    await adapter.sendTurn({ sessionId, text: firstPrompt });
    await firstCompleted;

    const initialGeneration = client.connectionGeneration;
    const initialProcessId = client.processId;
    expect(initialGeneration).toBeDefined();
    expect(initialProcessId).toBeDefined();
    if (!(initialGeneration && initialProcessId)) {
      return;
    }
    process.kill(initialProcessId, "SIGTERM");
    await waitFor(
      () => Promise.resolve(client.processId),
      (processId) => processId === undefined,
      "Codex reconnect thread app-server exit"
    );

    const completed = waitForTurnCompletion(
      adapter,
      sessionId,
      streamController.signal
    );
    const marker = `VIBEPAD_CODEX_RECONNECT_COMPLETE_${Date.now()}`;
    const prompt = `Reply with exactly ${marker}. Do not use tools.`;
    await adapter.sendTurn({ sessionId, text: prompt });
    await completed;

    const timeline = await waitFor(
      () => adapter.listTimeline(sessionId as string),
      (page) =>
        page.items.some((item) =>
          item.parts.some(
            (part) => part.type === "text" && part.text.trim() === marker
          )
        ),
      "Codex reconnect marker"
    );
    const textParts = timeline.items.flatMap((item) =>
      item.parts.flatMap((part) => (part.type === "text" ? [part.text] : []))
    );
    expect(textParts.filter((text) => text === firstPrompt)).toHaveLength(1);
    expect(
      textParts.filter((text) => text.trim() === firstMarker)
    ).toHaveLength(1);
    expect(textParts.filter((text) => text === prompt)).toHaveLength(1);
    expect(textParts.filter((text) => text.trim() === marker)).toHaveLength(1);
    expect(client.connectionGeneration).toBeGreaterThan(initialGeneration);
  } finally {
    streamController.abort();
    await disposeDisposableThread(client, adapter, sessionId);
  }
}, 90_000);

test("hydrates real Codex controls with the initial timeline and restores them after a host restart", async () => {
  if (!enabled) {
    return;
  }

  const sessionControlStore = new PersistentTestSessionControlStore();
  const firstAdapter = new CodexAdapter({
    projectRoots: [projectDirectory],
    sessionControlStore,
  });
  let firstDisposed = false;
  let secondAdapter: CodexAdapter | undefined;
  try {
    const inventory = await firstAdapter.listSessions();
    const session = inventory.find(
      (candidate) => candidate.controls.status === "inventory"
    );
    expect(session).toBeDefined();
    if (!session) {
      return;
    }

    const bootstrap = await firstAdapter.bootstrapSession(session.id);
    expect(bootstrap.session.controls).toEqual(
      expect.objectContaining({
        model: expect.objectContaining({ id: expect.any(String) }),
        status: "ready",
      })
    );
    expect(bootstrap.timeline.items).toEqual(expect.any(Array));

    await firstAdapter.dispose();
    firstDisposed = true;
    secondAdapter = new CodexAdapter({
      projectRoots: [projectDirectory],
      sessionControlStore,
    });
    const restored = (await secondAdapter.listSessions()).find(
      (candidate) => candidate.id === session.id
    );
    expect(restored?.controls).toEqual(bootstrap.session.controls);
  } finally {
    if (!firstDisposed) {
      await firstAdapter.dispose();
    }
    await secondAdapter?.dispose();
  }
}, 60_000);

test("restores a completed command from the durable event journal after an adapter restart", async () => {
  if (!enabled) {
    return;
  }

  const eventStore = new PersistentTestEventStore();
  const firstClient = new CodexAppServerClient();
  const firstAdapter = new CodexAdapter({
    client: firstClient,
    eventStore,
    projectRoots: [projectDirectory],
  });
  const streamController = new AbortController();
  let firstDisposed = false;
  let sessionId: string | undefined;
  let secondClient: CodexAppServerClient | undefined;
  let secondAdapter: CodexAdapter | undefined;

  try {
    const project = (await firstAdapter.listProjects()).find(
      (candidate) => candidate.path === projectDirectory
    );
    expect(project).toBeDefined();
    if (!project) {
      return;
    }
    sessionId = (await firstAdapter.createSession({ projectId: project.id }))
      .id;

    const completed = waitForTurnCompletion(
      firstAdapter,
      sessionId,
      streamController.signal
    );
    const marker = `VIBEPAD_CODEX_JOURNAL_${Date.now()}`;
    await firstAdapter.sendTurn({
      sessionId,
      text: `Use the shell exactly once to run printf ${marker}. Then reply with exactly ${marker}.`,
    });
    await completed;

    const beforeRestart = await firstAdapter.listTimeline(sessionId);
    expect(
      beforeRestart.items.some((item) =>
        item.parts.some(
          (part) =>
            part.type === "shell" &&
            part.command.includes(marker) &&
            part.output.includes(marker)
        )
      )
    ).toBe(true);

    streamController.abort();
    await firstAdapter.dispose();
    firstDisposed = true;

    secondClient = new CodexAppServerClient();
    secondAdapter = new CodexAdapter({
      client: secondClient,
      eventStore,
      projectRoots: [projectDirectory],
    });
    const afterRestart = await secondAdapter.listTimeline(sessionId);
    const recoveredCommands = afterRestart.items.filter((item) =>
      item.parts.some(
        (part) =>
          part.type === "shell" &&
          part.command.includes(marker) &&
          part.output.includes(marker)
      )
    );
    expect(recoveredCommands).toHaveLength(1);
  } finally {
    streamController.abort();
    if (secondClient && secondAdapter) {
      await disposeDisposableThread(secondClient, secondAdapter, sessionId);
    } else if (firstDisposed) {
      const cleanupClient = new CodexAppServerClient();
      try {
        if (sessionId) {
          await cleanupClient.request("thread/delete", {
            threadId: codexThreadId(sessionId),
          });
        }
      } finally {
        await cleanupClient.dispose();
      }
    } else {
      await disposeDisposableThread(firstClient, firstAdapter, sessionId);
    }
  }
}, 90_000);

test("rejects a memory-only empty Codex thread after restart instead of creating a ghost turn", async () => {
  if (!enabled) {
    return;
  }

  const client = new CodexAppServerClient();
  const adapter = new CodexAdapter({
    client,
    projectRoots: [projectDirectory],
  });
  let sessionId: string | undefined;
  let projectId: string | undefined;
  try {
    const project = (await adapter.listProjects()).find(
      (candidate) => candidate.path === projectDirectory
    );
    expect(project).toBeDefined();
    if (!project) {
      return;
    }
    projectId = project.id;
    sessionId = (await adapter.createSession({ projectId })).id;
    const initialProcessId = client.processId;
    expect(initialProcessId).toBeDefined();
    if (!initialProcessId) {
      return;
    }

    process.kill(initialProcessId, "SIGTERM");
    await waitFor(
      () => Promise.resolve(client.processId),
      (processId) => processId === undefined,
      "Codex empty-thread app-server exit"
    );

    await expect(
      adapter.sendTurn({
        sessionId,
        text: "This must not create a ghost Codex turn.",
      })
    ).rejects.toThrow(
      "was not materialized before the app-server disconnected"
    );
    const sessions = await adapter.listSessions(projectId);
    expect(sessions.some((session) => session.id === sessionId)).toBe(false);
  } finally {
    await adapter.dispose();
  }
}, 60_000);

test("reports the real Codex app-server as unauthenticated with an empty isolated home", async () => {
  if (!enabled) {
    return;
  }

  const codexHome = await mkdtemp(join(tmpdir(), "vibepad-codex-no-auth-"));
  const adapter = new CodexAdapter({
    env: {
      ...process.env,
      CODEX_HOME: codexHome,
      OPENAI_API_KEY: undefined,
    },
    projectRoots: [projectDirectory],
  });
  try {
    const health = await adapter.health();
    expect(health.healthy).toBe(false);
    expect(health.version).toContain("0.144.6");
  } finally {
    await adapter.dispose();
    await rm(codexHome, { force: true, recursive: true });
  }
}, 60_000);

test("projects real Codex projects, sessions, catalog, files, changes, and timeline", async () => {
  if (!enabled) {
    return;
  }

  const adapter = new CodexAdapter({ projectRoots: [projectDirectory] });
  try {
    const health = await adapter.health();
    expect(health.healthy).toBe(true);
    expect(health.version).toContain("0.144.6");

    const projects = await adapter.listProjects();
    const project = projects.find(
      (candidate) => candidate.path === projectDirectory
    );
    expect(project).toBeDefined();
    if (!project) {
      return;
    }
    expect(project.harnessId).toBe("codex");

    const sessions = await adapter.listSessions(project.id);
    expect(
      sessions.every((listedSession) => listedSession.harnessId === "codex")
    ).toBe(true);

    const { catalog } = await chooseFastModel(adapter, project.id);
    expect(catalog.providers.map((provider) => provider.id)).toContain(
      "openai"
    );
    expect(catalog.agents.map((agent) => agent.id)).toEqual(
      expect.arrayContaining(["default", "plan"])
    );
    expect(catalog.skills.some((skill) => skill.name === "agent-browser")).toBe(
      true
    );

    const files = await adapter.listFiles({ path: "", projectId: project.id });
    expect(files.some((file) => file.path === "package.json")).toBe(true);
    const packageJson = await adapter.readFile({
      path: "package.json",
      projectId: project.id,
    });
    expect(packageJson.type).toBe("text");
    expect(packageJson.content).toContain('"name": "vibepad"');

    const changes = await adapter.listFileChanges(project.id);
    expect(changes.some((change) => change.path === "package.json")).toBe(true);

    const session =
      sessions.find((candidate) => candidate.title.length > 0) ??
      (await adapter.listSessions())[0];
    const timeline = session && (await adapter.listTimeline(session.id));
    expect(timeline === undefined || timeline.items.length > 0).toBe(true);
  } finally {
    await adapter.dispose();
  }
}, 60_000);

test("runs, streams, switches, archives, and deletes a disposable real Codex thread", async () => {
  if (!enabled) {
    return;
  }

  const client = new CodexAppServerClient();
  const adapter = new CodexAdapter({
    client,
    projectRoots: [projectDirectory],
  });
  const streamController = new AbortController();
  let sessionId: string | undefined;

  try {
    const project = (await adapter.listProjects()).find(
      (candidate) => candidate.path === projectDirectory
    );
    expect(project).toBeDefined();
    if (!project) {
      return;
    }

    const created = await adapter.createSession({ projectId: project.id });
    sessionId = created.id;
    expect(
      (await adapter.listSessions(project.id)).some(
        (session) => session.id === sessionId
      )
    ).toBe(true);
    const title = `__VIBEPAD_CODEX_E2E_${Date.now()}`;
    const renamed = await adapter.renameSession({ sessionId, title });
    expect(renamed.title).toBe(title);

    const { model } = await chooseFastModel(adapter, project.id);
    const selectedModel = await adapter.selectModel({
      id: model.id,
      providerId: model.providerId,
      sessionId,
      variant: model.variants.includes("low") ? "low" : model.variants[0],
    });
    expect(selectedModel.controls).toEqual(
      expect.objectContaining({
        model: expect.objectContaining({ id: model.id }),
        status: "ready",
      })
    );
    const plan = await adapter.selectAgent({ agentId: "plan", sessionId });
    expect(plan.controls).toEqual(
      expect.objectContaining({ agent: "plan", status: "ready" })
    );
    const build = await adapter.selectAgent({
      agentId: "default",
      sessionId,
    });
    expect(build.controls).toEqual(
      expect.objectContaining({ agent: "default", status: "ready" })
    );

    const completed = waitForTurnCompletion(
      adapter,
      sessionId,
      streamController.signal
    );
    const marker = `VIBEPAD_CODEX_COMPLETE_${Date.now()}`;
    await adapter.sendTurn({
      sessionId,
      text: `Reply with exactly ${marker}. Do not use tools.`,
    });
    await completed;

    const timeline = await waitFor(
      () => adapter.listTimeline(sessionId as string),
      (page) =>
        page.items.some((item) =>
          item.parts.some(
            (part) => part.type === "text" && part.text.trim() === marker
          )
        ),
      "Codex exact marker"
    );
    expect(timeline.items.length).toBeGreaterThan(1);

    await adapter.archiveSession({ sessionId });
    const sessions = await adapter.listSessions(project.id);
    expect(sessions.some((session) => session.id === sessionId)).toBe(false);
  } finally {
    streamController.abort();
    await disposeDisposableThread(client, adapter, sessionId);
  }
}, 90_000);

test("interrupts a real Codex turn paused on approval", async () => {
  if (!enabled) {
    return;
  }

  const client = new CodexAppServerClient();
  const adapter = new CodexAdapter({
    client,
    projectRoots: [projectDirectory],
  });
  const streamController = new AbortController();
  let sessionId: string | undefined;

  try {
    const started = await startDirectThread(client, {
      approvalPolicy: "untrusted",
      cwd: projectDirectory,
      model: "gpt-5.6-luna",
      sandbox: "read-only",
    });
    sessionId = codexSessionId(started.thread.id);
    const forbiddenMarker = `VIBEPAD_CODEX_INTERRUPTED_${Date.now()}`;
    await adapter.sendTurn({
      sessionId,
      text: `You must run this exact shell command using the shell tool: bash -lc 'printf VIBEPAD_INTERRUPT_GATE'. Then reply with exactly ${forbiddenMarker}.`,
    });
    const completions: ProviderEvent[] = [];
    const collectingSessionId = sessionId;
    (async () => {
      for await (const event of adapter.subscribe(
        collectingSessionId,
        streamController.signal
      )) {
        if (event.kind === "turn.completed") {
          completions.push(event);
        }
      }
    })().catch(() => undefined);
    await waitFor(
      () => adapter.listInteractions(sessionId as string),
      (items) => items.some((item) => item.kind === "permission"),
      "Codex interrupt approval gate"
    );

    // abortTurn now resolves only after Codex confirms the turn stopped —
    // via a real turn/completed or one of the fallback completion signals.
    await adapter.abortTurn(sessionId);
    await waitFor(
      () => adapter.listSessions(),
      (sessions) =>
        sessions.find((candidate) => candidate.id === sessionId)?.activity ===
        "idle",
      "Codex interrupted thread"
    );
    await delay(1500);
    expect(completions).toHaveLength(1);
    const timeline = await adapter.listTimeline(sessionId);
    expect(
      timeline.items.some(
        (item) =>
          item.role === "assistant" &&
          item.parts.some(
            (part) =>
              part.type === "text" && part.text.includes(forbiddenMarker)
          )
      )
    ).toBe(false);
  } finally {
    streamController.abort();
    await disposeDisposableThread(client, adapter, sessionId);
  }
}, 90_000);

test("settles a real fast Codex turn with exactly one completion signal", async () => {
  if (!enabled) {
    return;
  }

  const client = new CodexAppServerClient();
  const adapter = new CodexAdapter({
    client,
    projectRoots: [projectDirectory],
  });
  const streamController = new AbortController();
  let sessionId: string | undefined;

  try {
    const project = (await adapter.listProjects()).find(
      (candidate) => candidate.path === projectDirectory
    );
    expect(project).toBeDefined();
    if (!project) {
      return;
    }
    sessionId = (await adapter.createSession({ projectId: project.id })).id;
    const completions: ProviderEvent[] = [];
    const collectingSessionId = sessionId;
    (async () => {
      for await (const event of adapter.subscribe(
        collectingSessionId,
        streamController.signal
      )) {
        if (event.kind === "turn.completed") {
          completions.push(event);
        }
      }
    })().catch(() => undefined);

    const marker = `VIBEPAD_CODEX_SINGLE_COMPLETION_${Date.now()}`;
    await adapter.sendTurn({
      sessionId,
      text: `Reply with exactly ${marker}. Do not use tools.`,
    });
    await waitFor(
      () => Promise.resolve(completions.length),
      (count) => count >= 1,
      "Codex completion signal"
    );
    // The thread goes idle after the turn; the idle status and any
    // final_answer message must not synthesize a second completion.
    await waitFor(
      () => adapter.listSessions(),
      (sessions) =>
        sessions.find((candidate) => candidate.id === sessionId)?.activity ===
        "idle",
      "Codex idle after completion"
    );
    await delay(1500);
    expect(completions).toHaveLength(1);
  } finally {
    streamController.abort();
    await disposeDisposableThread(client, adapter, sessionId);
  }
}, 90_000);

test("answers a real Codex request_user_input callback", async () => {
  if (!enabled) {
    return;
  }

  const client = new CodexAppServerClient();
  const adapter = new CodexAdapter({
    client,
    projectRoots: [projectDirectory],
  });
  const streamController = new AbortController();
  let sessionId: string | undefined;

  try {
    const project = (await adapter.listProjects()).find(
      (candidate) => candidate.path === projectDirectory
    );
    expect(project).toBeDefined();
    if (!project) {
      return;
    }
    sessionId = (await adapter.createSession({ projectId: project.id })).id;
    const catalog = await adapter.listCatalog(project.id);
    const model =
      catalog.models.find((candidate) => candidate.id === "gpt-5.6-sol") ??
      catalog.models.find((candidate) => candidate.enabled);
    expect(model).toBeDefined();
    if (!model) {
      return;
    }
    await adapter.selectModel({
      id: model.id,
      providerId: model.providerId,
      sessionId,
      variant: model.variants.includes("medium") ? "medium" : model.variants[0],
    });
    await adapter.selectAgent({ agentId: "plan", sessionId });

    const completed = waitForTurnCompletion(
      adapter,
      sessionId,
      streamController.signal
    );
    const marker = `VIBEPAD_CODEX_QUESTION_${Date.now()}`;
    await adapter.sendTurn({
      sessionId,
      text: `Use request_user_input exactly once. Ask me to choose Blue or Gold. After I answer, reply with exactly ${marker}.`,
    });
    const interactions = await waitFor(
      () => adapter.listInteractions(sessionId as string),
      (items) => items.some((item) => item.kind === "question"),
      "Codex question"
    );
    const question = interactions.find((item) => item.kind === "question");
    expect(question).toBeDefined();
    if (!question) {
      return;
    }
    await adapter.respondQuestion({
      action: "answer",
      answers: [["Blue"]],
      requestId: question.id,
      sessionId,
    });
    await completed;
    const timeline = await waitFor(
      () => adapter.listTimeline(sessionId as string),
      (page) =>
        page.items.some((item) =>
          item.parts.some(
            (part) => part.type === "text" && part.text.trim() === marker
          )
        ),
      "Codex question completion"
    );
    expect(timeline.items.length).toBeGreaterThan(1);
  } finally {
    streamController.abort();
    await disposeDisposableThread(client, adapter, sessionId);
  }
}, 90_000);

test("answers a real Codex command approval callback", async () => {
  if (!enabled) {
    return;
  }

  const client = new CodexAppServerClient();
  const adapter = new CodexAdapter({
    client,
    projectRoots: [projectDirectory],
  });
  const streamController = new AbortController();
  let sessionId: string | undefined;

  try {
    const started = await startDirectThread(client, {
      approvalPolicy: "untrusted",
      cwd: projectDirectory,
      model: "gpt-5.6-luna",
      sandbox: "read-only",
    });
    sessionId = codexSessionId(started.thread.id);
    const completed = waitForTurnCompletion(
      adapter,
      sessionId,
      streamController.signal
    );
    const marker = `VIBEPAD_CODEX_PERMISSION_${Date.now()}`;
    await adapter.sendTurn({
      sessionId,
      text: `You must run this exact shell command using the shell tool: bash -lc 'printf VIBEPAD_APPROVAL_GRANTED'. Then reply with exactly ${marker}.`,
    });
    const interactions = await waitFor(
      () => adapter.listInteractions(sessionId as string),
      (items) => items.some((item) => item.kind === "permission"),
      "Codex permission"
    );
    const permission = interactions.find((item) => item.kind === "permission");
    expect(permission).toBeDefined();
    if (!permission) {
      return;
    }
    await adapter.respondPermission({
      decision: "once",
      requestId: permission.id,
      sessionId,
    });
    await completed;
    const timeline = await waitFor(
      () => adapter.listTimeline(sessionId as string),
      (page) =>
        page.items.some((item) =>
          item.parts.some(
            (part) => part.type === "text" && part.text.trim() === marker
          )
        ),
      "Codex permission completion"
    );
    expect(timeline.items.some((item) => item.kind === "shell")).toBe(true);
  } finally {
    streamController.abort();
    await disposeDisposableThread(client, adapter, sessionId);
  }
}, 90_000);
