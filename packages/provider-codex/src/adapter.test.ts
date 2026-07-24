import type {
  ProviderEvent,
  ProviderEventStore,
} from "@vibepad/protocol/events";
import { expect, it, vi } from "vitest";

import type { Turn } from "../generated/v2/Turn";
import { CodexAdapter } from "./adapter";
import type {
  CodexAppServerClient,
  CodexConnectionState,
  CodexServerNotification,
  CodexServerRequest,
} from "./app-server-client";
import { codexSessionId } from "./ids";

const projectRoot = "/home/simon/projects/codex-demo";
const threadId = "11111111-1111-4111-8111-111111111111";
const sessionId = codexSessionId(threadId);

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
    listSessionId: string,
    afterSequence = 0
  ): readonly ProviderEvent[] {
    return this.events.filter(
      (event) =>
        event.providerId === providerId &&
        event.sessionId === listSessionId &&
        event.sequence > afterSequence
    );
  }

  kinds(kindSessionId: string): readonly string[] {
    return this.events
      .filter((event) => event.sessionId === kindSessionId)
      .map((event) => event.kind);
  }

  ofKind(kindSessionId: string, kind: string): readonly ProviderEvent[] {
    return this.events.filter(
      (event) => event.sessionId === kindSessionId && event.kind === kind
    );
  }
}

class FakeCodexAppServerClient {
  readonly requests: { method: string; params: unknown }[] = [];
  readonly #connectionListeners = new Set<
    (state: CodexConnectionState) => void
  >();
  readonly #notificationListeners = new Set<
    (notification: CodexServerNotification) => void
  >();
  readonly #responders = new Map<string, (params: unknown) => unknown>();

  get connectionGeneration(): number {
    return 1;
  }

  dispose(): Promise<void> {
    return Promise.resolve();
  }

  handle(method: string, responder: (params: unknown) => unknown): void {
    this.#responders.set(method, responder);
  }

  notify(method: string, params: unknown): void {
    for (const listener of this.#notificationListeners) {
      listener({ method, params });
    }
  }

  notifyConnectionState(state: CodexConnectionState): void {
    for (const listener of this.#connectionListeners) {
      listener(state);
    }
  }

  onConnectionState(listener: (state: CodexConnectionState) => void) {
    this.#connectionListeners.add(listener);
    return () => {
      this.#connectionListeners.delete(listener);
    };
  }

  onNotification(listener: (notification: CodexServerNotification) => void) {
    this.#notificationListeners.add(listener);
    return () => {
      this.#notificationListeners.delete(listener);
    };
  }

  onRequest(_listener: (request: CodexServerRequest) => void) {
    return () => {
      // Nothing registered by the fake.
    };
  }

  request<Result>(method: string, params: unknown): Promise<Result> {
    this.requests.push({ method, params });
    const responder = this.#responders.get(method);
    if (!responder) {
      return Promise.reject(
        new Error(`Fake Codex client has no responder for ${method}`)
      );
    }
    return Promise.resolve(responder(params) as Result);
  }

  respond(): Promise<void> {
    return Promise.resolve();
  }

  respondError(): Promise<void> {
    return Promise.resolve();
  }

  start(): Promise<never> {
    return Promise.reject(
      new Error("Fake Codex client does not implement start")
    );
  }
}

const createAdapter = (interruptGraceMs?: number) => {
  const client = new FakeCodexAppServerClient();
  const eventStore = new MemoryEventStore();
  const adapter = new CodexAdapter({
    client: client as unknown as CodexAppServerClient,
    eventStore,
    ...(interruptGraceMs === undefined ? {} : { interruptGraceMs }),
    projectRoots: [projectRoot],
  });
  return { adapter, client, eventStore };
};

const turnPayload = (
  turnId: string,
  status: Turn["status"] = "inProgress"
): Turn => ({
  completedAt: status === "inProgress" ? null : 1_753_264_803,
  durationMs: status === "inProgress" ? null : 3000,
  error: null,
  id: turnId,
  items: [],
  itemsView: "full",
  startedAt: 1_753_264_800,
  status,
});

const startTurn = (client: FakeCodexAppServerClient, turnId: string) => {
  client.notify("turn/started", { threadId, turn: turnPayload(turnId) });
};

const completeTurn = (
  client: FakeCodexAppServerClient,
  turnId: string,
  status: Turn["status"] = "completed"
) => {
  client.notify("turn/completed", {
    threadId,
    turn: turnPayload(turnId, status),
  });
};

const idleThread = (client: FakeCodexAppServerClient) => {
  client.notify("thread/status/changed", {
    status: { type: "idle" },
    threadId,
  });
};

const finalAnswer = (client: FakeCodexAppServerClient, turnId: string) => {
  client.notify("item/completed", {
    item: {
      id: `message-${turnId}`,
      memoryCitation: null,
      phase: "final_answer",
      text: "Done.",
      type: "agentMessage",
    },
    threadId,
    turnId,
  });
};

const synthesizedFrom = (event: ProviderEvent | undefined) =>
  typeof event?.native === "object" && event.native !== null
    ? Reflect.get(event.native, "synthesizedFrom")
    : undefined;

it("emits one turn.completed for the real notification and ignores the trailing idle status", async () => {
  const { adapter, client, eventStore } = createAdapter();
  try {
    startTurn(client, "turn-1");
    completeTurn(client, "turn-1");
    idleThread(client);

    const completions = eventStore.ofKind(sessionId, "turn.completed");
    expect(completions).toHaveLength(1);
    expect(synthesizedFrom(completions[0])).toBeUndefined();
    expect(eventStore.kinds(sessionId)).toContain("session.updated");
  } finally {
    await adapter.dispose();
  }
});

it("synthesizes turn.completed from an idle thread status when Codex skips turn/completed", async () => {
  const { adapter, client, eventStore } = createAdapter();
  try {
    startTurn(client, "turn-1");
    idleThread(client);

    const completions = eventStore.ofKind(sessionId, "turn.completed");
    expect(completions).toHaveLength(1);
    expect(synthesizedFrom(completions[0])).toBe("thread/status/changed");

    // A late real turn/completed for the same turn must not double-fire.
    completeTurn(client, "turn-1");
    expect(eventStore.ofKind(sessionId, "turn.completed")).toHaveLength(1);

    // The guard releases for the next turn.
    startTurn(client, "turn-2");
    completeTurn(client, "turn-2");
    expect(eventStore.ofKind(sessionId, "turn.completed")).toHaveLength(2);
  } finally {
    await adapter.dispose();
  }
});

it("synthesizes turn.completed from a final_answer agent message", async () => {
  const { adapter, client, eventStore } = createAdapter();
  try {
    startTurn(client, "turn-1");
    finalAnswer(client, "turn-1");

    const completions = eventStore.ofKind(sessionId, "turn.completed");
    expect(completions).toHaveLength(1);
    expect(synthesizedFrom(completions[0])).toBe("item/completed:final_answer");
    expect(eventStore.kinds(sessionId)).toContain("timeline.item.upserted");

    // Neither a trailing idle status nor a late real completion re-fires.
    idleThread(client);
    completeTurn(client, "turn-1");
    expect(eventStore.ofKind(sessionId, "turn.completed")).toHaveLength(1);
  } finally {
    await adapter.dispose();
  }
});

it("ignores a final_answer that belongs to a different turn", async () => {
  const { adapter, client, eventStore } = createAdapter();
  try {
    startTurn(client, "turn-1");
    finalAnswer(client, "turn-other");
    expect(eventStore.ofKind(sessionId, "turn.completed")).toHaveLength(0);

    completeTurn(client, "turn-1");
    expect(eventStore.ofKind(sessionId, "turn.completed")).toHaveLength(1);
  } finally {
    await adapter.dispose();
  }
});

it("does not synthesize a completion when no turn is active", async () => {
  const { adapter, client, eventStore } = createAdapter();
  try {
    idleThread(client);
    expect(eventStore.ofKind(sessionId, "turn.completed")).toHaveLength(0);
    expect(eventStore.kinds(sessionId)).toContain("session.updated");
  } finally {
    await adapter.dispose();
  }
});

it("resolves abortTurn once the interrupted turn reports a real completion", async () => {
  const { adapter, client, eventStore } = createAdapter();
  client.handle("turn/interrupt", () => ({}));
  try {
    startTurn(client, "turn-1");
    const aborting = adapter.abortTurn(sessionId);
    completeTurn(client, "turn-1", "interrupted");
    await expect(aborting).resolves.toBeUndefined();

    expect(client.requests).toEqual([
      { method: "turn/interrupt", params: { threadId, turnId: "turn-1" } },
    ]);
    expect(eventStore.ofKind(sessionId, "turn.completed")).toHaveLength(1);
  } finally {
    await adapter.dispose();
  }
});

it("resolves abortTurn via the idle fallback when turn/completed never arrives", async () => {
  const { adapter, client, eventStore } = createAdapter();
  client.handle("turn/interrupt", () => ({}));
  try {
    startTurn(client, "turn-1");
    const aborting = adapter.abortTurn(sessionId);
    idleThread(client);
    await expect(aborting).resolves.toBeUndefined();

    const completions = eventStore.ofKind(sessionId, "turn.completed");
    expect(completions).toHaveLength(1);
    expect(synthesizedFrom(completions[0])).toBe("thread/status/changed");
  } finally {
    await adapter.dispose();
  }
});

it("surfaces an unsettled interrupt and stays consistent for a later real completion", async () => {
  const { adapter, client, eventStore } = createAdapter(25);
  client.handle("turn/interrupt", () => ({}));
  client.handle("thread/turns/list", () => ({ data: [], nextCursor: null }));
  try {
    startTurn(client, "turn-1");
    await expect(adapter.abortTurn(sessionId)).rejects.toThrow(
      "did not stop within 25ms"
    );
    expect(eventStore.ofKind(sessionId, "turn.completed")).toHaveLength(0);

    // The turn stays active, so a later real completion still lands once.
    completeTurn(client, "turn-1", "interrupted");
    expect(eventStore.ofKind(sessionId, "turn.completed")).toHaveLength(1);
    await expect(adapter.abortTurn(sessionId)).rejects.toThrow(
      "no active turn"
    );
  } finally {
    await adapter.dispose();
  }
});

it("keeps the skipped-turn tolerance by discovering the active turn before interrupting", async () => {
  const { adapter, client, eventStore } = createAdapter();
  client.handle("turn/interrupt", () => ({}));
  client.handle("thread/turns/list", () => ({
    data: [turnPayload("turn-listed")],
    nextCursor: null,
  }));
  try {
    const aborting = adapter.abortTurn(sessionId);
    await vi.waitFor(() => {
      expect(client.requests.map((request) => request.method)).toContain(
        "turn/interrupt"
      );
    });
    completeTurn(client, "turn-listed", "interrupted");
    await expect(aborting).resolves.toBeUndefined();

    expect(client.requests.map((request) => request.method)).toEqual([
      "thread/turns/list",
      "turn/interrupt",
    ]);
    expect(eventStore.ofKind(sessionId, "turn.completed")).toHaveLength(1);
  } finally {
    await adapter.dispose();
  }
});
