import type { BrowserState } from "@vibepad/protocol/browser";
import { describe, expect, it, vi } from "vitest";

import { createBrowserStore } from "./browser-store";

const browserTarget = {
  id: "target-1",
  title: "Example Domain",
  url: "https://example.com/",
};

const browserState: BrowserState = {
  activeTargetId: "target-1",
  available: true,
  canGoBack: false,
  canGoForward: true,
  healthy: true,
  targets: [browserTarget],
};

describe("Legend VibePad Browser store", () => {
  it("normalizes CDP targets and retains one unexpired view session", async () => {
    const host = {
      closeBrowserTarget: vi.fn(() => Promise.resolve()),
      createBrowserTarget: vi.fn(() =>
        Promise.resolve({
          id: "target-2",
          title: "Example Org",
          url: "https://example.org/",
        })
      ),
      createBrowserViewSession: vi.fn(() =>
        Promise.resolve({
          expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          path: "/v1/browser/view/token/vnc.html",
          url: "http://gmk:4100/v1/browser/view/token/vnc.html",
        })
      ),
      loadBrowser: vi.fn(() => Promise.resolve(browserState)),
      performBrowserTargetAction: vi.fn(() => Promise.resolve()),
    };
    const store = createBrowserStore(host);

    await store.load();
    await store.load(true);

    expect(store.state$.peek()).toMatchObject({
      activeTargetId: "target-1",
      canGoForward: true,
      draftUrl: "https://example.com/",
      status: "ready",
      targetIds: ["target-1"],
      targetsById: { "target-1": browserState.targets[0] },
      viewUrl: "http://gmk:4100/v1/browser/view/token/vnc.html",
    });
    expect(host.createBrowserViewSession).toHaveBeenCalledTimes(1);

    await store.openTarget("https://example.org/");
    expect(store.state$.activeTargetId.peek()).toBe("target-2");
    expect(store.state$.targetIds.peek()).toEqual(["target-1", "target-2"]);
  });

  it("can load again after a pending request is cancelled", async () => {
    const firstRequest = Promise.withResolvers<BrowserState>();
    const host = {
      closeBrowserTarget: vi.fn(() => Promise.resolve()),
      createBrowserTarget: vi.fn(() => Promise.resolve(browserTarget)),
      createBrowserViewSession: vi.fn(() =>
        Promise.resolve({
          expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          path: "/v1/browser/view/token/vnc.html",
          url: "http://gmk:4100/v1/browser/view/token/vnc.html",
        })
      ),
      loadBrowser: vi
        .fn()
        .mockImplementationOnce(() => firstRequest.promise)
        .mockResolvedValue(browserState),
      performBrowserTargetAction: vi.fn(() => Promise.resolve()),
    };
    const store = createBrowserStore(host);

    const cancelledLoad = store.load();
    expect(store.state$.status.peek()).toBe("loading");
    store.cancelPending();
    expect(store.state$.status.peek()).toBe("idle");

    await store.load();
    firstRequest.resolve(browserState);
    await cancelledLoad;

    expect(store.state$.status.peek()).toBe("ready");
    expect(host.loadBrowser).toHaveBeenCalledTimes(2);
  });
});
