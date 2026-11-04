import { createOpencodeClient } from "@opencode-ai/sdk/v2/client";
import type { ProviderEvent } from "@vibepad/protocol/events";
import { expect, it as test } from "vitest";

import { OpenCodeAdapter } from "./adapter";
import { openCodeNativeSessionId, openCodeSessionId } from "./ids";
import { openCodeCapabilityOperations, openCodeManifest } from "./manifest";

declare const process: {
  readonly cwd: () => string;
  readonly env: {
    readonly VIBEPAD_LIVE_OPENCODE_TESTS?: string;
    readonly VIBEPAD_LIVE_OPENCODE_INTERACTION_URL?: string;
    readonly VIBEPAD_LIVE_OPENCODE_AUTH_PASSWORD?: string;
    readonly VIBEPAD_LIVE_OPENCODE_AUTH_URL?: string;
    readonly VIBEPAD_LIVE_OPENCODE_AUTH_USERNAME?: string;
    readonly VIBEPAD_LIVE_PROJECT_DIR?: string;
    readonly VIBEPAD_LIVE_TIMELINE_PROJECT_DIR?: string;
    readonly VIBEPAD_LIVE_TIMELINE_SESSION_ID?: string;
    readonly VIBEPAD_OPENCODE_URL?: string;
  };
};

const enabled = process.env.VIBEPAD_LIVE_OPENCODE_TESTS === "1";
const baseUrl = process.env.VIBEPAD_OPENCODE_URL ?? "http://127.0.0.1:4096";
const interactionBaseUrl = process.env.VIBEPAD_LIVE_OPENCODE_INTERACTION_URL;
const authBaseUrl = process.env.VIBEPAD_LIVE_OPENCODE_AUTH_URL;
const authPassword = process.env.VIBEPAD_LIVE_OPENCODE_AUTH_PASSWORD;
const authUsername = process.env.VIBEPAD_LIVE_OPENCODE_AUTH_USERNAME;
const projectDirectory = process.env.VIBEPAD_LIVE_PROJECT_DIR ?? process.cwd();
const timelineProjectDirectory =
  process.env.VIBEPAD_LIVE_TIMELINE_PROJECT_DIR ?? projectDirectory;
const timelineSessionId = process.env.VIBEPAD_LIVE_TIMELINE_SESSION_ID;
const fileChangeStatus = /^(?:added|deleted|modified)$/u;

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });

const withTimeout = async <Value>(
  promise: Promise<Value>,
  milliseconds: number,
  label: string
): Promise<Value> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${milliseconds}ms`)),
          milliseconds
        );
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
};

const waitFor = async <Value>(
  load: () => Promise<Value>,
  matches: (value: Value) => boolean,
  label: string,
  milliseconds = 10_000
) => {
  const started = Date.now();
  while (Date.now() - started < milliseconds) {
    // biome-ignore lint/performance/noAwaitInLoops: Real provider state is polled until it converges.
    const value = await load();
    if (matches(value)) {
      return value;
    }
    await delay(100);
  }
  throw new Error(`${label} did not converge after ${milliseconds}ms`);
};

test("advertises only capabilities backed by adapter operations", () => {
  for (const [capabilityId, support] of Object.entries(
    openCodeManifest.capabilities
  )) {
    if (support.state === "unsupported") {
      continue;
    }
    const operation =
      openCodeCapabilityOperations[
        capabilityId as keyof typeof openCodeCapabilityOperations
      ];
    expect(operation, `${capabilityId} has no adapter operation`).toBeDefined();
    expect(
      typeof Reflect.get(OpenCodeAdapter.prototype, String(operation)),
      `${capabilityId} points to missing adapter.${operation}`
    ).toBe("function");
  }
});

test("rejects missing credentials and connects to a real authenticated server", async () => {
  if (!(authBaseUrl && authPassword && authUsername)) {
    return;
  }

  await expect(new OpenCodeAdapter(authBaseUrl).health()).rejects.toBeDefined();
  const authenticated = new OpenCodeAdapter({
    baseUrl: authBaseUrl,
    password: authPassword,
    username: authUsername,
  });
  await expect(authenticated.health()).resolves.toEqual(
    expect.objectContaining({ healthy: true, version: expect.any(String) })
  );
  await expect(authenticated.listProjects()).resolves.not.toHaveLength(0);
}, 30_000);

test("lists and reads real files plus structured VCS changes", async () => {
  if (!enabled) {
    return;
  }

  const adapter = new OpenCodeAdapter(baseUrl);
  const projects = await adapter.listProjects();
  const project = projects.find(
    (candidate) => candidate.path === projectDirectory
  );
  expect(project).toBeDefined();
  if (!project) {
    return;
  }
  expect(project.harnessId).toBe("opencode");

  const sessions = await adapter.listSessions(project.id);
  expect(sessions.every((session) => session.harnessId === "opencode")).toBe(
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
  for (const change of changes) {
    expect(change).toEqual(
      expect.objectContaining({
        additions: expect.any(Number),
        deletions: expect.any(Number),
        path: expect.any(String),
        status: expect.stringMatching(fileChangeStatus),
      })
    );
  }
}, 30_000);

test("lists the real provider catalog and switches model and primary agent", async () => {
  if (!enabled) {
    return;
  }

  const client = createOpencodeClient({ baseUrl });
  const adapter = new OpenCodeAdapter(baseUrl);
  let sessionId: string | undefined;

  try {
    const project = (await adapter.listProjects()).find(
      (candidate) => candidate.path === projectDirectory
    );
    expect(project).toBeDefined();
    if (!project) {
      return;
    }

    const catalog = await adapter.listCatalog(project.id);
    expect(catalog.providers.length).toBeGreaterThan(0);
    expect(catalog.models.length).toBeGreaterThan(0);
    expect(catalog.models.every((model) => model.native !== undefined)).toBe(
      true
    );
    expect(catalog.agents.some((agent) => agent.id === "build")).toBe(true);
    expect(catalog.agents.some((agent) => agent.id === "plan")).toBe(true);

    const selectedModel =
      catalog.models.find(
        (model) =>
          model.enabled &&
          model.providerId === "opencode" &&
          model.id === "hy3-free"
      ) ??
      catalog.models.find(
        (model) => model.enabled && model.status === "active"
      );
    expect(selectedModel).toBeDefined();
    if (!selectedModel) {
      return;
    }

    const created = await adapter.createSession({ projectId: project.id });
    sessionId = created.id;
    const modelSession = await adapter.selectModel({
      id: selectedModel.id,
      providerId: selectedModel.providerId,
      sessionId,
    });
    expect(modelSession.controls).toEqual(
      expect.objectContaining({
        model: expect.objectContaining({
          id: selectedModel.id,
          providerId: selectedModel.providerId,
        }),
        status: "ready",
      })
    );

    const planSession = await adapter.selectAgent({
      agentId: "plan",
      sessionId,
    });
    expect(planSession.controls).toEqual(
      expect.objectContaining({ agent: "plan", status: "ready" })
    );
    const buildSession = await adapter.selectAgent({
      agentId: "build",
      sessionId,
    });
    expect(buildSession.controls).toEqual(
      expect.objectContaining({ agent: "build", status: "ready" })
    );
  } finally {
    if (sessionId) {
      await client.session
        .delete(
          {
            directory: projectDirectory,
            sessionID: openCodeNativeSessionId(sessionId),
          },
          { throwOnError: true }
        )
        .catch(() => undefined);
    }
  }
}, 30_000);

test("loads a real nested-directory timeline when the v2 projection is unavailable", async () => {
  if (!(enabled && timelineSessionId)) {
    return;
  }

  const client = createOpencodeClient({ baseUrl });
  const adapter = new OpenCodeAdapter(baseUrl);
  const listed = await client.v2.session.list(
    { limit: 200, order: "desc" },
    { throwOnError: true }
  );
  const session = listed.data.data.find(
    (candidate) => candidate.id === timelineSessionId
  );
  expect(session).toBeDefined();
  if (!session) {
    return;
  }
  const sessionDirectory = session.location.directory;

  expect(sessionDirectory).not.toBe(timelineProjectDirectory);
  expect(sessionDirectory.startsWith(`${timelineProjectDirectory}/`)).toBe(
    true
  );

  const nativeTimeline = await client.session.messages(
    {
      directory: sessionDirectory,
      limit: 100,
      sessionID: timelineSessionId,
    },
    { throwOnError: true }
  );
  expect(nativeTimeline.data.length).toBeGreaterThan(0);

  const projectedTimeline = await client.v2.session
    .messages(
      { limit: 100, order: "desc", sessionID: timelineSessionId },
      { throwOnError: true }
    )
    .then((result) => result.data.data)
    .catch(() => []);
  expect(projectedTimeline).toHaveLength(0);

  const publicTimelineSessionId = openCodeSessionId(timelineSessionId);
  const timeline = await adapter.listTimeline(publicTimelineSessionId);
  expect(timeline.items.length).toBe(nativeTimeline.data.length);
  expect(timeline.items.some((item) => item.kind === "message")).toBe(true);
  await expect(
    adapter.listInteractions(publicTimelineSessionId)
  ).resolves.toEqual([]);
}, 30_000);

test("archives a real OpenCode session, filters it, and cleans it up", async () => {
  if (!enabled) {
    return;
  }

  const client = createOpencodeClient({ baseUrl });
  const adapter = new OpenCodeAdapter(baseUrl);
  let sessionId: string | undefined;

  try {
    const created = await client.v2.session.create(
      {
        location: { directory: projectDirectory },
      },
      { throwOnError: true }
    );
    const nativeSessionId = created.data.data.id;
    sessionId = openCodeSessionId(nativeSessionId);
    const title = `__VIBEPAD_E2E_ARCHIVE_${Date.now()}`;
    await client.session.update(
      {
        directory: projectDirectory,
        metadata: { "vibepad.e2e": true },
        sessionID: nativeSessionId,
        title,
      },
      { throwOnError: true }
    );

    const before = await adapter.listSessions();
    expect(before.some((session) => session.id === sessionId)).toBe(true);

    await adapter.archiveSession({ sessionId });

    const archived = await client.v2.session.get(
      { sessionID: nativeSessionId },
      { throwOnError: true }
    );
    expect(archived.data.data.time.archived).toEqual(expect.any(Number));

    const after = await adapter.listSessions();
    expect(after.some((session) => session.id === sessionId)).toBe(false);
  } finally {
    if (sessionId) {
      await client.session
        .delete(
          {
            directory: projectDirectory,
            sessionID: openCodeNativeSessionId(sessionId),
          },
          { throwOnError: true }
        )
        .catch(() => undefined);
    }
  }
}, 30_000);

test("runs a complete real session lifecycle and resumes its durable event cursor", async () => {
  if (!enabled) {
    return;
  }

  const client = createOpencodeClient({ baseUrl });
  const adapter = new OpenCodeAdapter(baseUrl);
  const streamController = new AbortController();
  const replayController = new AbortController();
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
    const createdSessionId = created.id;
    const title = `__VIBEPAD_E2E_LIFECYCLE_${Date.now()}`;
    const renamed = await adapter.renameSession({
      sessionId: createdSessionId,
      title,
    });
    expect(renamed.title).toBe(title);

    const eventsPromise = (async () => {
      const events: ProviderEvent[] = [];
      for await (const event of adapter.subscribe(
        createdSessionId,
        streamController.signal
      )) {
        events.push(event);
        if (event.kind === "turn.completed") {
          return events;
        }
      }
      return events;
    })();

    const responseMarker = `VIBEPAD_LIFECYCLE_${Date.now()}`;
    await adapter.sendTurn({
      sessionId: createdSessionId,
      text: `Reply with exactly ${responseMarker} and nothing else.`,
    });
    const events = await withTimeout(
      eventsPromise,
      60_000,
      "OpenCode lifecycle stream"
    );
    expect(events.some((event) => event.kind === "turn.started")).toBe(true);
    expect(events.at(-1)?.kind).toBe("turn.completed");
    expect(events.every((event) => event.native !== undefined)).toBe(true);
    expect(events.map((event) => event.sequence)).toEqual(
      [...events.map((event) => event.sequence)].sort(
        (left, right) => left - right
      )
    );

    const timeline = await waitFor(
      () => adapter.listTimeline(createdSessionId),
      (page) =>
        page.items.some((item) =>
          item.parts.some(
            (part) => part.type === "text" && part.text === responseMarker
          )
        ),
      "durable OpenCode timeline"
    );
    expect(
      timeline.items.some(
        (item) =>
          item.role === "user" &&
          item.parts.some(
            (part) => part.type === "text" && part.text.includes(responseMarker)
          )
      )
    ).toBe(true);

    const replayAnchorIndex = events.findIndex(
      (event) => event.kind === "turn.started"
    );
    const replayAnchor = events[replayAnchorIndex];
    const expectedReplay = events[replayAnchorIndex + 1];
    expect(replayAnchor?.cursor).toBeDefined();
    expect(expectedReplay).toBeDefined();
    if (!(replayAnchor?.cursor && expectedReplay)) {
      return;
    }
    streamController.abort();
    const replayed = await withTimeout(
      (async () => {
        for await (const event of adapter.subscribe(
          createdSessionId,
          replayController.signal,
          replayAnchor.cursor
        )) {
          return event;
        }
        throw new Error(
          "OpenCode replay stream ended before yielding an event"
        );
      })(),
      10_000,
      "OpenCode durable event replay"
    );
    expect(replayed.eventId).toBe(expectedReplay.eventId);

    const listed = await adapter.listSessions(project.id);
    expect(
      listed.find((session) => session.id === createdSessionId)?.title
    ).toBe(title);
  } finally {
    streamController.abort();
    replayController.abort();
    if (sessionId) {
      await client.session
        .delete(
          {
            directory: projectDirectory,
            sessionID: openCodeNativeSessionId(sessionId),
          },
          { throwOnError: true }
        )
        .catch(() => undefined);
    }
  }
}, 90_000);

test("interrupts a real active OpenCode turn and returns the session to idle", async () => {
  if (!enabled) {
    return;
  }

  const client = createOpencodeClient({ baseUrl });
  const adapter = new OpenCodeAdapter(baseUrl);
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
    const createdSessionId = created.id;
    const nativeSessionId = openCodeNativeSessionId(createdSessionId);

    const started = (async () => {
      for await (const event of adapter.subscribe(
        createdSessionId,
        streamController.signal
      )) {
        if (event.kind === "turn.started") {
          return event;
        }
      }
      throw new Error("OpenCode stream ended before the turn started");
    })();

    const forbiddenMarker = `VIBEPAD_INTERRUPT_SHOULD_NOT_COMPLETE_${Date.now()}`;
    await adapter.sendTurn({
      sessionId: createdSessionId,
      text: `Think carefully for a while, then reply with exactly ${forbiddenMarker}.`,
    });
    await withTimeout(started, 30_000, "OpenCode turn start");

    const activeBefore = await client.v2.session.active({ throwOnError: true });
    expect(JSON.stringify(activeBefore.data)).toContain(nativeSessionId);
    const sessionsBefore = await adapter.listSessions(project.id);
    expect(
      sessionsBefore.find((session) => session.id === createdSessionId)
        ?.activity
    ).toBe("busy");

    await adapter.abortTurn(createdSessionId);
    await waitFor(
      async () => {
        const active = await client.v2.session.active({ throwOnError: true });
        return JSON.stringify(active.data);
      },
      (active) => !active.includes(nativeSessionId),
      "OpenCode active-session removal"
    );

    const sessions = await adapter.listSessions(project.id);
    expect(
      sessions.find((session) => session.id === createdSessionId)?.activity
    ).toBe("idle");
    const timeline = await adapter.listTimeline(createdSessionId);
    expect(
      timeline.items.some((item) =>
        item.parts.some(
          (part) => part.type === "text" && part.text.trim() === forbiddenMarker
        )
      )
    ).toBe(false);
  } finally {
    streamController.abort();
    if (sessionId) {
      await client.session
        .delete(
          {
            directory: projectDirectory,
            sessionID: openCodeNativeSessionId(sessionId),
          },
          { throwOnError: true }
        )
        .catch(() => undefined);
    }
  }
}, 60_000);

test("answers a real permission and structured question through the adapter", async () => {
  if (!(enabled && interactionBaseUrl)) {
    return;
  }

  const client = createOpencodeClient({ baseUrl: interactionBaseUrl });
  const adapter = new OpenCodeAdapter(interactionBaseUrl);
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
    const createdSessionId = created.id;
    const nativeSessionId = openCodeNativeSessionId(createdSessionId);

    const permissionResult = client.v2.session.permission.create(
      {
        action: "external_directory",
        metadata: { purpose: "interactive adapter verification" },
        resources: ["/root/vibepad-e2e"],
        save: ["/root/vibepad-*"],
        sessionID: nativeSessionId,
      },
      { throwOnError: true }
    );
    const interactionsWithPermission = await waitFor(
      () => adapter.listInteractions(createdSessionId),
      (interactions) =>
        interactions.some((interaction) => interaction.kind === "permission"),
      "OpenCode permission request"
    );
    const permission = interactionsWithPermission.find(
      (interaction) => interaction.kind === "permission"
    );
    expect(permission).toEqual(
      expect.objectContaining({
        action: "external_directory",
        resources: ["/root/vibepad-e2e"],
        save: ["/root/vibepad-*"],
      })
    );
    if (!permission) {
      return;
    }
    const pendingSession = (await adapter.listSessions(project.id)).find(
      (session) => session.id === createdSessionId
    );
    expect(pendingSession?.pendingInput).toBe("permission");
    await adapter.respondPermission({
      decision: "once",
      requestId: permission.id,
      sessionId: createdSessionId,
    });
    expect((await permissionResult).data.data.effect).toBe("ask");
    expect(await adapter.listInteractions(createdSessionId)).toEqual([]);

    const completion = (async () => {
      for await (const event of adapter.subscribe(
        createdSessionId,
        streamController.signal
      )) {
        if (event.kind === "turn.completed") {
          return event;
        }
      }
      throw new Error("OpenCode stream ended before question turn completion");
    })();

    const completionMarker = `VIBEPAD_QUESTION_ANSWERED_${Date.now()}`;
    await adapter.sendTurn({
      sessionId: createdSessionId,
      text: `Use the question tool to ask exactly one question. Header: Color. Question: Pick a color. Options: Blue (Cool tone) and Green (Natural tone). Do not ask in plain text. After I answer, reply with exactly ${completionMarker}.`,
    });

    const firstQuestionInteractions = await waitFor(
      () => adapter.listInteractions(createdSessionId),
      (interactions) =>
        interactions.some(
          (interaction) =>
            interaction.kind === "permission" || interaction.kind === "question"
        ),
      "OpenCode question interaction",
      30_000
    );
    const toolPermission = firstQuestionInteractions.find(
      (interaction) => interaction.kind === "permission"
    );
    if (toolPermission) {
      await adapter.respondPermission({
        decision: "once",
        requestId: toolPermission.id,
        sessionId: createdSessionId,
      });
    }

    const questionInteractions = firstQuestionInteractions.some(
      (interaction) => interaction.kind === "question"
    )
      ? firstQuestionInteractions
      : await waitFor(
          () => adapter.listInteractions(createdSessionId),
          (interactions) =>
            interactions.some((interaction) => interaction.kind === "question"),
          "OpenCode structured question",
          30_000
        );
    const question = questionInteractions.find(
      (interaction) => interaction.kind === "question"
    );
    expect(question?.questions[0]).toEqual(
      expect.objectContaining({
        header: "Color",
        multiple: false,
        question: "Pick a color.",
      })
    );
    if (!question) {
      return;
    }
    const firstOption = question.questions[0]?.options[0]?.label;
    expect(firstOption).toEqual(expect.any(String));
    if (!firstOption) {
      return;
    }
    await adapter.respondQuestion({
      action: "answer",
      answers: [[firstOption]],
      requestId: question.id,
      sessionId: createdSessionId,
    });
    await withTimeout(completion, 60_000, "OpenCode question turn completion");

    const timeline = await waitFor(
      () => adapter.listTimeline(createdSessionId),
      (page) =>
        page.items.some((item) =>
          item.parts.some(
            (part) =>
              part.type === "text" && part.text.trim() === completionMarker
          )
        ),
      "OpenCode post-question response",
      30_000
    );
    expect(
      timeline.items.some((item) =>
        item.parts.some(
          (part) =>
            part.type === "tool" &&
            part.name === "question" &&
            part.status === "completed"
        )
      )
    ).toBe(true);
  } finally {
    streamController.abort();
    if (sessionId) {
      await client.session
        .delete(
          {
            directory: projectDirectory,
            sessionID: openCodeNativeSessionId(sessionId),
          },
          { throwOnError: true }
        )
        .catch(() => undefined);
    }
  }
}, 120_000);
