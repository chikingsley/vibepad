import { describe, expect, it } from "vitest";

import {
  createWorkspaceUiStore,
  defaultWorkbenchLayout,
} from "./workspace-ui-store";

describe("Legend workspace UI store", () => {
  it("opens the default session once and preserves explicit tab choices", () => {
    const store = createWorkspaceUiStore();

    store.reconcileSessions(["a", "b"], "a");
    store.selectSession("b");
    store.reconcileSessions(["a", "b", "c"], "c");

    expect(store.state$.openSessionIds.peek()).toEqual(["a", "b"]);
    expect(store.state$.selectedSessionId.peek()).toBe("b");
  });

  it("selects the nearest remaining tab when the active tab closes", () => {
    const store = createWorkspaceUiStore();
    store.reconcileSessions(["a", "b", "c"], "a");
    store.selectSession("b");
    store.selectSession("c");
    store.selectSession("b");

    store.closeSessionTab("b");

    expect(store.state$.openSessionIds.peek()).toEqual(["a", "c"]);
    expect(store.state$.selectedSessionId.peek()).toBe("c");
  });

  it("removes unavailable sessions while retaining a valid selection", () => {
    const store = createWorkspaceUiStore();
    store.reconcileSessions(["a", "b"], "a");
    store.selectSession("b");

    store.reconcileSessions(["a"], "a");

    expect(store.state$.openSessionIds.peek()).toEqual(["a"]);
    expect(store.state$.selectedSessionId.peek()).toBe("a");
  });

  it("updates one session workbench without notifying another", () => {
    const store = createWorkspaceUiStore();
    store.state$.workbenchesBySessionId.set({
      a: defaultWorkbenchLayout,
      b: defaultWorkbenchLayout,
    });
    const firstSessionId = "a";
    const secondSessionId = "b";
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
      surface: "preview",
    });
    expect(firstNotifications).toBe(1);
    expect(secondNotifications).toBe(0);
    disposeFirst();
    disposeSecond();
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
