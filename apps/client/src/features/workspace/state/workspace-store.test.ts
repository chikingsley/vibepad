import type {
  ReadySessionControls,
  SessionSummary,
} from "@vibepad/protocol/provider";
import { describe, expect, it } from "vitest";

import type { WorkspaceSnapshot } from "@/lib/vibepad-host";

import { createWorkspaceStore } from "./workspace-store";

const session = (
  id: string,
  controls?: ReadySessionControls
): SessionSummary => {
  const base = {
    activity: "idle" as const,
    harnessId: "codex" as const,
    id,
    native: null,
    projectId: "codex:/workspace",
    title: id,
  };
  return controls
    ? { ...base, controls }
    : { ...base, controls: { status: "inventory" } };
};

const snapshot = (sessions: readonly SessionSummary[]): WorkspaceSnapshot => ({
  health: {
    host: { healthy: true, id: "hochi" },
    provider: { healthy: true },
    providers: [{ healthy: true, id: "codex" }],
  },
  projects: [
    {
      harnessId: "codex",
      id: "codex:/workspace",
      name: "workspace",
      native: null,
      path: "/workspace",
    },
  ],
  providers: [],
  sessions,
});

describe("Legend workspace store", () => {
  it("loads a real workspace-shaped snapshot into normalized registries", async () => {
    const store = createWorkspaceStore({
      loadWorkspace: async () =>
        snapshot([session("session-a"), session("session-b")]),
    });

    await store.refresh();

    expect(store.readView()).toEqual({
      data: snapshot([session("session-a"), session("session-b")]),
      status: "ready",
    });
    expect(store.state$.sessionIds.peek()).toEqual(["session-a", "session-b"]);
  });

  it("hydrates one session without notifying an unrelated session", async () => {
    const store = createWorkspaceStore({
      loadWorkspace: async () =>
        snapshot([session("session-a"), session("session-b")]),
    });
    await store.refresh();
    let hydratedNotifications = 0;
    let unrelatedNotifications = 0;
    const hydrated$ = store.session$("session-a");
    const unrelated$ = store.session$("session-b");
    if (!(hydrated$ && unrelated$)) {
      throw new Error("Expected both normalized sessions");
    }
    const disposeHydrated = hydrated$.onChange(() => {
      hydratedNotifications += 1;
    });
    const disposeUnrelated = unrelated$.onChange(() => {
      unrelatedNotifications += 1;
    });

    store.upsertSession(
      session("session-a", {
        model: { id: "gpt-5.6", providerId: "openai" },
        status: "ready",
      })
    );

    expect(hydrated$.controls.status.peek()).toBe("ready");
    expect(hydratedNotifications).toBe(1);
    expect(unrelatedNotifications).toBe(0);
    disposeHydrated();
    disposeUnrelated();
  });
});
