import { createOpencodeClient } from "@opencode-ai/sdk/v2/client";
import { providerEventSchema } from "@vibepad/protocol/events";
import {
  hostHealthResponseSchema,
  interactionListResponseSchema,
  projectListResponseSchema,
  providerCatalogResponseSchema,
  providerListResponseSchema,
  sessionResponseSchema,
  timelineResponseSchema,
} from "@vibepad/protocol/transport";
import { CodexAdapter } from "@vibepad/provider-codex/adapter";
import { CodexAppServerClient } from "@vibepad/provider-codex/client";
import { codexThreadId } from "@vibepad/provider-codex/ids";
import { OpenCodeAdapter } from "@vibepad/provider-opencode/adapter";
import { openCodeNativeSessionId } from "@vibepad/provider-opencode/ids";
import { expect, it as test } from "vitest";

import { createRequestHandler } from "./http";
import { ProviderRouter } from "./provider-router";

const environment = process.env as Readonly<{
  VIBEPAD_LIVE_OPENCODE_TESTS?: string;
  VIBEPAD_LIVE_CODEX_TESTS?: string;
  VIBEPAD_LIVE_OPENCODE_INTERACTION_URL?: string;
  VIBEPAD_LIVE_PROJECT_DIR?: string;
  VIBEPAD_OPENCODE_URL?: string;
}>;
const enabled = environment.VIBEPAD_LIVE_OPENCODE_TESTS === "1";
const codexEnabled = environment.VIBEPAD_LIVE_CODEX_TESTS === "1";
const openCodeBaseUrl =
  environment.VIBEPAD_OPENCODE_URL ?? "http://127.0.0.1:4096";
const projectDirectory =
  environment.VIBEPAD_LIVE_PROJECT_DIR ?? "/home/simon/github/vibepad";
const interactionBaseUrl = environment.VIBEPAD_LIVE_OPENCODE_INTERACTION_URL;

const responseError = async (response: Response) =>
  `${response.status}: ${(await response.text()) || response.statusText}`;

const post = async (
  handler: ReturnType<typeof createRequestHandler>,
  path: string,
  body: unknown
) => {
  const response = await handler(
    new Request(`http://vibepad.test${path}`, {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
  );
  if (!response.ok) {
    throw new Error(`VibePad host ${await responseError(response)}`);
  }
  return response;
};

const nextTurnStart = async (response: Response) => {
  if (!response.body) {
    throw new Error("VibePad host event stream has no body");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let ended = false;
  while (!ended) {
    // biome-ignore lint/performance/noAwaitInLoops: NDJSON chunks must be read in order.
    const { done, value } = await reader.read();
    ended = done;
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }
      const event = providerEventSchema.parse(JSON.parse(line) as unknown);
      if (event.kind === "turn.started") {
        return event;
      }
    }
    if (ended) {
      throw new Error("VibePad host event stream ended before turn start");
    }
  }
};

const nextTurnCompletion = async (response: Response) => {
  if (!response.body) {
    throw new Error("VibePad host event stream has no body");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let ended = false;
  while (!ended) {
    // biome-ignore lint/performance/noAwaitInLoops: NDJSON chunks must be read in order.
    const { done, value } = await reader.read();
    ended = done;
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }
      const event = providerEventSchema.parse(JSON.parse(line) as unknown);
      if (event.kind === "turn.completed") {
        return event;
      }
    }
    if (ended) {
      throw new Error("VibePad host event stream ended before turn completion");
    }
  }
};

const waitUntilInactive = async (
  client: ReturnType<typeof createOpencodeClient>,
  sessionId: string
) => {
  const nativeSessionId = openCodeNativeSessionId(sessionId);
  for (let attempt = 0; attempt < 100; attempt += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: Provider state is polled until interrupt converges.
    const active = await client.v2.session.active({ throwOnError: true });
    if (!JSON.stringify(active.data).includes(nativeSessionId)) {
      return;
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50);
    });
  }
  throw new Error("OpenCode session remained active after host interrupt");
};

test("interrupts a real OpenCode turn through the VibePad host transport", async () => {
  if (!enabled) {
    return;
  }

  const adapter = new OpenCodeAdapter(openCodeBaseUrl);
  const nativeClient = createOpencodeClient({ baseUrl: openCodeBaseUrl });
  const handler = createRequestHandler(adapter, "vibepad-e2e-host");
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

    const createdResponse = await post(handler, "/v1/sessions", {
      projectId: project.id,
    });
    const created = sessionResponseSchema.parse(
      await createdResponse.json()
    ).data;
    sessionId = created.id;

    const restartedRouter = new ProviderRouter([
      new OpenCodeAdapter(openCodeBaseUrl),
    ]);
    await expect(restartedRouter.listTimeline(sessionId)).resolves.toEqual(
      expect.objectContaining({ items: expect.any(Array) })
    );
    const legacyTimeline = await restartedRouter.listTimeline(
      openCodeNativeSessionId(sessionId)
    );
    expect(legacyTimeline).toEqual(
      expect.objectContaining({ items: expect.any(Array) })
    );
    expect(
      legacyTimeline.items.every((item) => item.sessionId === sessionId)
    ).toBe(true);

    const streamResponse = await handler(
      new Request(
        `http://vibepad.test/v1/sessions/${encodeURIComponent(sessionId)}/events`,
        { signal: streamController.signal }
      )
    );
    expect(streamResponse.ok).toBe(true);
    const started = nextTurnStart(streamResponse);

    const marker = `VIBEPAD_HOST_INTERRUPT_${Date.now()}`;
    const turnResponse = await post(
      handler,
      `/v1/sessions/${encodeURIComponent(sessionId)}/turns`,
      {
        text: `Think carefully for a while, then reply with exactly ${marker}.`,
      }
    );
    expect(turnResponse.status).toBe(202);
    await started;

    const interruptResponse = await post(
      handler,
      `/v1/sessions/${encodeURIComponent(sessionId)}/turns/interrupt`,
      {}
    );
    expect(interruptResponse.status).toBe(202);
    expect(await interruptResponse.json()).toEqual({ interrupted: true });
    await waitUntilInactive(nativeClient, sessionId);

    const timelineResponse = await handler(
      new Request(
        `http://vibepad.test/v1/sessions/${encodeURIComponent(sessionId)}/timeline`
      )
    );
    expect(timelineResponse.ok).toBe(true);
    const timeline = timelineResponseSchema.parse(
      await timelineResponse.json()
    ).data;
    expect(
      timeline.items.some(
        (item) =>
          item.role === "assistant" &&
          item.parts.some(
            (part) => part.type === "text" && part.text.trim() === marker
          )
      )
    ).toBe(false);
    expect(JSON.stringify(timeline.items.map((item) => item.native))).toContain(
      "Provider turn interrupted"
    );
  } finally {
    streamController.abort();
    if (sessionId) {
      await nativeClient.session
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

test("lists the real catalog and switches model and agent through the host transport", async () => {
  if (!enabled) {
    return;
  }

  const adapter = new OpenCodeAdapter(openCodeBaseUrl);
  const nativeClient = createOpencodeClient({ baseUrl: openCodeBaseUrl });
  const handler = createRequestHandler(adapter, "vibepad-e2e-host");
  let sessionId: string | undefined;

  try {
    const project = (await adapter.listProjects()).find(
      (candidate) => candidate.path === projectDirectory
    );
    expect(project).toBeDefined();
    if (!project) {
      return;
    }

    const catalogResponse = await handler(
      new Request(
        `http://vibepad.test/v1/projects/${encodeURIComponent(project.id)}/catalog`
      )
    );
    expect(catalogResponse.ok).toBe(true);
    const catalog = providerCatalogResponseSchema.parse(
      await catalogResponse.json()
    ).data;
    const selectedModel =
      catalog.models.find(
        (model) =>
          model.enabled &&
          model.providerId === "opencode" &&
          model.id === "hy3-free"
      ) ?? catalog.models.find((model) => model.enabled);
    expect(selectedModel).toBeDefined();
    if (!selectedModel) {
      return;
    }

    const createdResponse = await post(handler, "/v1/sessions", {
      projectId: project.id,
    });
    sessionId = sessionResponseSchema.parse(await createdResponse.json()).data
      .id;

    const modelResponse = await post(
      handler,
      `/v1/sessions/${encodeURIComponent(sessionId)}/model`,
      {
        id: selectedModel.id,
        providerId: selectedModel.providerId,
      }
    );
    const modelSession = sessionResponseSchema.parse(
      await modelResponse.json()
    ).data;
    expect(modelSession.controls).toEqual(
      expect.objectContaining({
        model: expect.objectContaining({
          id: selectedModel.id,
          providerId: selectedModel.providerId,
        }),
        status: "ready",
      })
    );

    const agentResponse = await post(
      handler,
      `/v1/sessions/${encodeURIComponent(sessionId)}/agent`,
      { agentId: "plan" }
    );
    const agentSession = sessionResponseSchema.parse(
      await agentResponse.json()
    ).data;
    expect(agentSession.controls).toEqual(
      expect.objectContaining({ agent: "plan", status: "ready" })
    );
  } finally {
    if (sessionId) {
      await nativeClient.session
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

test("answers a real OpenCode permission through the VibePad host transport", async () => {
  if (!(enabled && interactionBaseUrl)) {
    return;
  }

  const adapter = new OpenCodeAdapter(interactionBaseUrl);
  const nativeClient = createOpencodeClient({ baseUrl: interactionBaseUrl });
  const handler = createRequestHandler(adapter, "vibepad-e2e-host");
  let sessionId: string | undefined;

  try {
    const project = (await adapter.listProjects()).find(
      (candidate) => candidate.path === projectDirectory
    );
    expect(project).toBeDefined();
    if (!project) {
      return;
    }
    const session = await adapter.createSession({ projectId: project.id });
    sessionId = session.id;
    const createdSessionId = session.id;
    const nativeSessionId = openCodeNativeSessionId(createdSessionId);
    const permissionResult = nativeClient.v2.session.permission.create(
      {
        action: "external_directory",
        resources: ["/root/vibepad-host-e2e"],
        sessionID: nativeSessionId,
      },
      { throwOnError: true }
    );

    let requestId: string | undefined;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: The real provider request is polled through the host until visible.
      const response = await handler(
        new Request(
          `http://vibepad.test/v1/sessions/${encodeURIComponent(createdSessionId)}/interactions`
        )
      );
      expect(response.ok).toBe(true);
      const interactions = interactionListResponseSchema.parse(
        await response.json()
      ).data;
      requestId = interactions.find(
        (interaction) => interaction.kind === "permission"
      )?.id;
      if (requestId) {
        break;
      }
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 50);
      });
    }
    expect(requestId).toEqual(expect.any(String));
    if (!requestId) {
      return;
    }

    const reply = await post(
      handler,
      `/v1/sessions/${encodeURIComponent(createdSessionId)}/permissions/${encodeURIComponent(requestId)}/reply`,
      { decision: "once" }
    );
    expect(await reply.json()).toEqual({ resolved: true });
    expect((await permissionResult).data.data.effect).toBe("ask");
  } finally {
    if (sessionId) {
      await nativeClient.session
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

test("routes a real Codex turn beside OpenCode through the shared host transport", async () => {
  if (!(enabled && codexEnabled)) {
    return;
  }

  const codexClient = new CodexAppServerClient();
  const router = new ProviderRouter([
    new OpenCodeAdapter(openCodeBaseUrl),
    new CodexAdapter({
      client: codexClient,
      projectRoots: [projectDirectory],
    }),
  ]);
  const handler = createRequestHandler(router, "vibepad-multi-provider-e2e");
  const streamController = new AbortController();
  let sessionId: string | undefined;

  try {
    const healthResponse = await handler(
      new Request("http://vibepad.test/health")
    );
    const health = hostHealthResponseSchema.parse(await healthResponse.json());
    expect(health.providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ healthy: true, id: "opencode" }),
        expect.objectContaining({ healthy: true, id: "codex" }),
      ])
    );

    const providersResponse = await handler(
      new Request("http://vibepad.test/v1/providers")
    );
    const providers = providerListResponseSchema.parse(
      await providersResponse.json()
    ).data;
    expect(providers.map((provider) => provider.id)).toEqual(
      expect.arrayContaining(["opencode", "codex"])
    );

    const projectsResponse = await handler(
      new Request("http://vibepad.test/v1/projects")
    );
    const projects = projectListResponseSchema.parse(
      await projectsResponse.json()
    ).data;
    const project = projects.find(
      (candidate) =>
        candidate.harnessId === "codex" && candidate.path === projectDirectory
    );
    expect(project).toBeDefined();
    if (!project) {
      return;
    }

    const catalogResponse = await handler(
      new Request(
        `http://vibepad.test/v1/projects/${encodeURIComponent(project.id)}/catalog`
      )
    );
    const catalog = providerCatalogResponseSchema.parse(
      await catalogResponse.json()
    ).data;
    const model =
      catalog.models.find((candidate) => candidate.id === "gpt-5.6-luna") ??
      catalog.models.find((candidate) => candidate.enabled);
    expect(model).toBeDefined();
    if (!model) {
      return;
    }

    const createdResponse = await post(handler, "/v1/sessions", {
      projectId: project.id,
    });
    sessionId = sessionResponseSchema.parse(await createdResponse.json()).data
      .id;
    expect(sessionId.startsWith("codex:thread:")).toBe(true);

    const modelResponse = await post(
      handler,
      `/v1/sessions/${encodeURIComponent(sessionId)}/model`,
      {
        id: model.id,
        providerId: model.providerId,
        variant: model.variants.includes("low") ? "low" : model.variants[0],
      }
    );
    const selected = sessionResponseSchema.parse(
      await modelResponse.json()
    ).data;
    expect(selected.controls).toEqual(
      expect.objectContaining({
        model: expect.objectContaining({ id: model.id }),
        status: "ready",
      })
    );

    const streamResponse = await handler(
      new Request(
        `http://vibepad.test/v1/sessions/${encodeURIComponent(sessionId)}/events`,
        { signal: streamController.signal }
      )
    );
    expect(streamResponse.ok).toBe(true);
    const completed = nextTurnCompletion(streamResponse);
    const marker = `VIBEPAD_HOST_CODEX_${Date.now()}`;
    const turnResponse = await post(
      handler,
      `/v1/sessions/${encodeURIComponent(sessionId)}/turns`,
      { text: `Reply with exactly ${marker}. Do not use tools.` }
    );
    expect(turnResponse.status).toBe(202);
    await completed;

    const timelineResponse = await handler(
      new Request(
        `http://vibepad.test/v1/sessions/${encodeURIComponent(sessionId)}/timeline`
      )
    );
    const timeline = timelineResponseSchema.parse(
      await timelineResponse.json()
    ).data;
    expect(
      timeline.items.some((item) =>
        item.parts.some(
          (part) => part.type === "text" && part.text.trim() === marker
        )
      )
    ).toBe(true);
  } finally {
    streamController.abort();
    if (sessionId) {
      await codexClient
        .request("thread/delete", { threadId: codexThreadId(sessionId) })
        .catch(() => undefined);
    }
    await router.dispose();
  }
}, 90_000);
