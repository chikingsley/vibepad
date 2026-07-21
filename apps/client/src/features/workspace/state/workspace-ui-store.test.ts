import { describe, expect, it } from "vitest";

import type { WorkspaceUiStorage } from "../storage/workspace-ui-storage";
import {
  defaultWorkbenchLayout,
  type WorkspaceUiSnapshot,
  workspaceUiSnapshotSchemaVersion,
} from "./workspace-ui-persistence";
import { createWorkspaceUiStore } from "./workspace-ui-store";

describe("Legend workspace UI store", () => {
  const firstSessionId = "a";
  const secondSessionId = "b";

  it("selects the default session once and preserves an explicit selection", () => {
    const store = createWorkspaceUiStore();

    store.reconcileSessions(["a", "b"], "a");
    store.selectSession("b");
    store.reconcileSessions(["a", "b", "c"], "c");

    expect(store.state$.selectedSessionId.peek()).toBe("b");
  });

  it("selects the nearest remaining session when the active session is removed", () => {
    const store = createWorkspaceUiStore();
    store.reconcileSessions(["a", "b", "c"], "a");
    store.selectSession("b");

    store.removeSession("b");

    expect(store.state$.selectedSessionId.peek()).toBe("c");
  });

  it("replaces an unavailable selection with the provider default", () => {
    const store = createWorkspaceUiStore();
    store.reconcileSessions(["a", "b"], "a");
    store.selectSession("b");

    store.reconcileSessions(["a"], "a");

    expect(store.state$.selectedSessionId.peek()).toBe("a");
  });

  it("updates one session workbench without notifying another", () => {
    const store = createWorkspaceUiStore();
    store.state$.workbenchesBySessionId.set({
      a: defaultWorkbenchLayout,
      b: defaultWorkbenchLayout,
    });
    const first$ = store.state$.workbenchesBySessionId[firstSessionId];
    const second$ = store.state$.workbenchesBySessionId[secondSessionId];
    if (!(first$ && second$)) {
      throw new Error("Expected both session workbenches");
    }
    let firstNotifications = 0;
    let secondNotifications = 0;
    const disposeFirst = first$.onChange(() => {
      firstNotifications += 1;
    });
    const disposeSecond = second$.onChange(() => {
      secondNotifications += 1;
    });

    store.selectSurface("a", "preview");

    expect(store.workbenchFor("a")).toEqual({
      expanded: false,
      open: true,
      splitRatio: 0.4,
      surface: "preview",
    });
    expect(firstNotifications).toBe(1);
    expect(secondNotifications).toBe(0);
    disposeFirst();
    disposeSecond();
  });

  it("clamps and persists a session split ratio", async () => {
    const writes: WorkspaceUiSnapshot[] = [];
    const storage: WorkspaceUiStorage = {
      read: () => Promise.resolve(undefined),
      write: (_hostId, snapshot) => {
        writes.push(snapshot);
        return Promise.resolve();
      },
    };
    const store = createWorkspaceUiStore(storage, "hojo");

    store.setWorkbenchSplitRatio("a", 0.95);
    await store.waitForPersistence();

    expect(store.workbenchFor("a").splitRatio).toBe(0.68);
    expect(
      writes.at(-1)?.workbenchesBySessionId[firstSessionId]?.splitRatio
    ).toBe(0.68);
  });

  it("hydrates persisted sidebar and session layouts", async () => {
    const stored: WorkspaceUiSnapshot = {
      desktopSidebarOpen: false,
      expandedProjects: { global: true },
      schemaVersion: workspaceUiSnapshotSchemaVersion,
      workbenchesBySessionId: {
        a: {
          expanded: false,
          open: true,
          splitRatio: 0.52,
          surface: "files",
        },
      },
    };
    const storage: WorkspaceUiStorage = {
      read: () => Promise.resolve(stored),
      write: () => Promise.resolve(),
    };
    const store = createWorkspaceUiStore(storage, "hojo");

    await store.load();

    expect(store.state$.desktopSidebarOpen.peek()).toBe(false);
    expect(store.state$.expandedProjects.peek()).toEqual({ global: true });
    expect(store.workbenchFor("a")).toEqual(
      stored.workbenchesBySessionId[firstSessionId]
    );
  });

  it("keeps regular and compact sidebar visibility independent", () => {
    const store = createWorkspaceUiStore();

    store.toggleSidebar(true);
    store.toggleSidebar(false);

    expect(store.state$.desktopSidebarOpen.peek()).toBe(false);
    expect(store.state$.mobileSidebarOpen.peek()).toBe(true);
  });

  it("changes the settings page without notifying its open state", () => {
    const store = createWorkspaceUiStore();
    store.showSettings("timeline");
    let openNotifications = 0;
    let pageNotifications = 0;
    const disposeOpen = store.state$.settingsOpen.onChange(() => {
      openNotifications += 1;
    });
    const disposePage = store.state$.settingsPage.onChange(() => {
      pageNotifications += 1;
    });

    store.showSettings("voice");

    expect(store.state$.settingsPage.peek()).toBe("voice");
    expect(pageNotifications).toBe(1);
    expect(openNotifications).toBe(0);
    disposeOpen();
    disposePage();
  });
});
