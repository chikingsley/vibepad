import type { ProviderEvent } from "@vibepad/protocol/events";
import type { PendingInteraction } from "@vibepad/protocol/interactions";
import type {
  ReadySessionSummary,
  SessionBootstrap,
  SessionSummary,
} from "@vibepad/protocol/provider";
import type { TimelineItem, TimelinePage } from "@vibepad/protocol/timeline";
import { describe, expect, it } from "vitest";

import { createSessionRuntimeStore } from "./session-runtime-store";

const session = (id: string): ReadySessionSummary => ({
  activity: "idle",
  controls: { status: "ready" },
  harnessId: "codex",
  id,
  native: null,
  projectId: "codex:/workspace",
  title: id,
});

const item = (sessionId: string, id: string): TimelineItem => ({
  createdAt: "2026-07-20T05:00:00.000Z",
  id,
  kind: "message",
  native: null,
  parts: [{ format: "plain", id: `${id}:text`, text: id, type: "text" }],
  role: "assistant",
  sessionId,
  visibility: "primary",
});

const page = (
  sessionId: string,
  ids: readonly string[],
  olderCursor?: string
): TimelinePage => ({
  items: ids.map((id) => item(sessionId, id)),
  ...(olderCursor ? { olderCursor } : {}),
});

const event = (
  sessionId: string,
  kind: ProviderEvent["kind"]
): ProviderEvent => ({
  cursor: "cursor-1",
  eventId: `${sessionId}:${kind}`,
  kind,
  native: null,
  projectId: "codex:/workspace",
  providerId: "codex",
  sequence: 1,
  sessionId,
  timestamp: "2026-07-20T05:00:00.000Z",
});

const waitForAbort = (signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    signal.addEventListener("abort", () => resolve(), { once: true });
  });

interface RuntimeFixtureOptions {
  readonly events?: readonly ProviderEvent[];
  readonly latest?: TimelinePage;
}

const createRuntimeFixture = (options: RuntimeFixtureOptions = {}) => {
  let bootstrapLoads = 0;
  let interactionLoads = 0;
  let latestLoads = 0;
  const bootstraps = new Map<string, SessionBootstrap>();
  const olderPages = new Map<string, TimelinePage>();
  const host = {
    bootstrapSession: (sessionId: string) => {
      bootstrapLoads += 1;
      return Promise.resolve(
        bootstraps.get(sessionId) ?? {
          session: session(sessionId),
          timeline: page(sessionId, [`${sessionId}:latest`], "older-1"),
        }
      );
    },
    listInteractions: (): Promise<readonly PendingInteraction[]> => {
      interactionLoads += 1;
      return Promise.resolve([]);
    },
    loadTimeline: (
      sessionId: string,
      _signal?: AbortSignal,
      before?: string
    ) => {
      if (before) {
        return Promise.resolve(olderPages.get(before) ?? page(sessionId, []));
      }
      latestLoads += 1;
      return Promise.resolve(
        options.latest ?? page(sessionId, [`${sessionId}:latest`])
      );
    },
    async *subscribeSessionEvents(_sessionId: string, signal: AbortSignal) {
      for (const providerEvent of options.events ?? []) {
        yield providerEvent;
      }
      await waitForAbort(signal);
    },
  };
  return {
    bootstraps,
    counts: {
      get bootstrapLoads() {
        return bootstrapLoads;
      },
      get interactionLoads() {
        return interactionLoads;
      },
      get latestLoads() {
        return latestLoads;
      },
    },
    host,
    olderPages,
  };
};

describe("Legend session runtime store", () => {
  it("bootstraps a session and hydrates the workspace summary", async () => {
    const fixture = createRuntimeFixture();
    const hydrated: SessionSummary[] = [];
    const store = createSessionRuntimeStore(fixture.host, (value) => {
      if (value.controls.status === "ready") {
        hydrated.push(value);
      }
    });

    const deactivate = store.activateSession("session-a");
    await expect
      .poll(() => store.state$.bySessionId["session-a"]?.timelineStatus.peek())
      .toBe("ready");

    expect(fixture.counts.bootstrapLoads).toBe(1);
    expect(fixture.counts.interactionLoads).toBe(1);
    expect(hydrated).toEqual([session("session-a")]);
    expect(
      store.state$.bySessionId["session-a"]?.timeline.peek()?.items[0]?.id
    ).toBe("session-a:latest");
    deactivate();
    store.cancelPending();
  });

  it("repairs a cached session without bootstrapping it again", async () => {
    const fixture = createRuntimeFixture();
    const store = createSessionRuntimeStore(fixture.host, () => undefined);

    const firstDeactivate = store.activateSession("session-a");
    await expect
      .poll(() => store.state$.bySessionId["session-a"]?.timelineStatus.peek())
      .toBe("ready");
    firstDeactivate();
    const secondDeactivate = store.activateSession("session-a");
    await expect.poll(() => fixture.counts.latestLoads).toBe(1);

    expect(fixture.counts.bootstrapLoads).toBe(1);
    expect(fixture.counts.interactionLoads).toBe(2);
    secondDeactivate();
    store.cancelPending();
  });

  it("prepends older history without waking another session", async () => {
    const fixture = createRuntimeFixture();
    fixture.olderPages.set(
      "older-1",
      page("session-a", ["session-a:older", "session-a:latest"])
    );
    const store = createSessionRuntimeStore(fixture.host, () => undefined);
    const deactivateA = store.activateSession("session-a");
    const deactivateB = store.activateSession("session-b");
    await expect
      .poll(() => store.state$.bySessionId["session-a"]?.timelineStatus.peek())
      .toBe("ready");
    await expect
      .poll(() => store.state$.bySessionId["session-b"]?.timelineStatus.peek())
      .toBe("ready");
    const sessionB$ = store.state$.bySessionId["session-b"];
    if (!sessionB$) {
      throw new Error("Expected a session-b runtime");
    }
    let sessionBNotifications = 0;
    const disposeB = sessionB$.onChange(() => {
      sessionBNotifications += 1;
    });

    await store.loadOlder("session-a");

    expect(
      store.state$.bySessionId["session-a"]?.timeline
        .peek()
        ?.items.map(({ id }) => id)
    ).toEqual(["session-a:older", "session-a:latest"]);
    expect(sessionBNotifications).toBe(0);
    disposeB();
    deactivateA();
    deactivateB();
    store.cancelPending();
  });

  it("applies live activity and repairs the latest timeline", async () => {
    const fixture = createRuntimeFixture({
      events: [event("session-a", "turn.started")],
      latest: page("session-a", ["session-a:latest", "session-a:new"]),
    });
    const store = createSessionRuntimeStore(fixture.host, () => undefined);

    const deactivate = store.activateSession("session-a");
    await expect
      .poll(() => store.state$.bySessionId["session-a"]?.running.peek())
      .toBe(true);
    await expect.poll(() => fixture.counts.latestLoads).toBe(1);

    expect(
      store.state$.bySessionId["session-a"]?.timeline
        .peek()
        ?.items.map(({ id }) => id)
    ).toEqual(["session-a:latest", "session-a:new"]);
    deactivate();
    store.cancelPending();
  });
});
