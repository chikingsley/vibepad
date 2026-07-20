import { describe, expect, it } from "vitest";

import { createPreviewStore } from "./preview-store";

describe("Legend preview store", () => {
  it("isolates session tabs and preserves initialized state", () => {
    const sessionAId = "a";
    const sessionBId = "b";
    const store = createPreviewStore();
    store.ensureSession(sessionAId, "https://a.example");
    store.ensureSession(sessionBId, "https://b.example");
    const sessionA$ = store.state$.bySessionId[sessionAId];
    const sessionB$ = store.state$.bySessionId[sessionBId];
    if (!(sessionA$ && sessionB$)) {
      throw new Error("Legend did not create preview session keys");
    }
    let sessionANotifications = 0;
    let sessionBNotifications = 0;
    const disposeA = sessionA$.onChange(() => {
      sessionANotifications += 1;
    });
    const disposeB = sessionB$.onChange(() => {
      sessionBNotifications += 1;
    });

    const openedId = store.openTab(sessionAId, "https://next.example", "agent");
    store.ensureSession(sessionAId, "https://replacement.example");

    expect(openedId).toBe("browser-tab-2");
    expect(sessionA$.activeTabId.peek()).toBe("browser-tab-2");
    expect(sessionA$.tabs.peek()).toHaveLength(2);
    expect(sessionA$.tabs.peek()[0]?.sourceUrl).toBe("https://a.example");
    expect(sessionANotifications).toBeGreaterThan(0);
    expect(sessionBNotifications).toBe(0);
    disposeA();
    disposeB();
  });

  it("selects the adjacent tab when the active tab closes", () => {
    const sessionId = "session";
    const store = createPreviewStore();
    store.ensureSession(sessionId, "https://first.example");
    store.openTab(sessionId, "https://second.example", "user");
    store.openTab(sessionId, "https://third.example", "agent");

    expect(store.closeTab(sessionId, "browser-tab-3")).toBe(2);
    expect(store.state$.bySessionId[sessionId]?.activeTabId.peek()).toBe(
      "browser-tab-2"
    );
    expect(store.closeTab(sessionId, "browser-tab-2")).toBe(1);
    expect(store.state$.bySessionId[sessionId]?.activeTabId.peek()).toBe(
      "browser-tab-1"
    );
  });

  it("retains cue timing across preview unmounts and resets explicitly", () => {
    const sessionId = "session";
    const store = createPreviewStore();
    store.ensureSession(sessionId, "https://example.com");

    const firstCue = store.startCue(sessionId, "stroke", 1000);
    if (!firstCue) {
      throw new Error("Expected the initialized preview to allocate a cue");
    }
    expect(firstCue).toEqual({
      id: "stroke-1",
      offsetMs: 0,
    });
    store.updateReview(sessionId, (current) => ({
      ...current,
      cues: [
        {
          id: firstCue.id,
          kind: "stroke",
          offsetMs: firstCue.offsetMs,
          points: [],
          target: { tabId: "browser-tab-1", url: "https://example.com" },
        },
      ],
    }));
    expect(store.startCue(sessionId, "selection", 1450)).toEqual({
      id: "selection-2",
      offsetMs: 450,
    });
    expect(store.state$.bySessionId[sessionId]?.review.reviewing.peek()).toBe(
      true
    );

    store.clearReview(sessionId);

    expect(store.state$.bySessionId[sessionId]?.review.peek()).toEqual({
      cues: [],
      pendingSelectionCount: 0,
      reviewing: false,
    });
    expect(store.startCue(sessionId, "stroke", 2000)).toEqual({
      id: "stroke-3",
      offsetMs: 0,
    });

    store.updateReview(sessionId, (current) => ({
      ...current,
      cues: [
        {
          id: "stroke-3",
          kind: "stroke",
          offsetMs: 0,
          points: [],
          target: { tabId: "browser-tab-1", url: "https://example.com" },
        },
      ],
    }));
    store.removeCue(sessionId, "stroke-3");

    expect(store.startCue(sessionId, "stroke", 5000)).toEqual({
      id: "stroke-4",
      offsetMs: 0,
    });
  });
});
