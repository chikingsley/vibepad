import type { HarnessAdapter } from "@vibepad/protocol/provider";
import { describe, expect, it } from "vitest";

import {
  type BrokeredBrowser,
  type BrokeredSupervisor,
  BrowserService,
  type BrowserViewClient,
} from "./browser-service";
import type { ChromiumScreencastFrame } from "./chromium-browser";
import { createRequestHandler } from "./http";

interface FakeTarget {
  targetId: string;
  title: string;
  type: string;
  url: string;
}

interface RecordedCommand {
  readonly method: string;
  readonly params: Record<string, unknown>;
  readonly sessionId: string | undefined;
}

class FakeBrowser implements BrokeredBrowser {
  readonly commands: RecordedCommand[] = [];
  frameSink: ((frame: ChromiumScreencastFrame) => void) | undefined;
  screencastStarts: Record<string, unknown>[] = [];
  screencastStops = 0;
  targets: FakeTarget[] = [];
  #nextId = 1;

  createTab(url: string) {
    const id = this.#nextId;
    this.#nextId += 1;
    this.targets.push({
      targetId: `target-${id}`,
      title: "",
      type: "page",
      url,
    });
    return Promise.resolve({
      sessionId: `session-${id}`,
      targetId: `target-${id}`,
    });
  }

  listTargets() {
    // Chromium enumerates targets in a non-deterministic order; the broker
    // must not depend on it, so the fake reports newest-first.
    return Promise.resolve([...this.targets].reverse());
  }

  send<T = Record<string, unknown>>(
    method: string,
    params: Record<string, unknown> = {},
    sessionId?: string
  ): Promise<T> {
    this.commands.push({ method, params, sessionId });
    // biome-ignore lint/complexity/useLiteralKeys: strict index-signature access is required by the shared TypeScript config.
    const paramTargetId = params["targetId"];
    if (method === "Target.getTargetInfo") {
      const target = this.targets.find(
        (candidate) => candidate.targetId === paramTargetId
      );
      return Promise.resolve({
        targetInfo: { title: target?.title ?? "", url: target?.url ?? "" },
      } as T);
    }
    if (method === "Target.attachToTarget") {
      return Promise.resolve({
        sessionId: `attached-${String(paramTargetId)}`,
      } as T);
    }
    if (method === "Target.closeTarget") {
      this.targets = this.targets.filter(
        (candidate) => candidate.targetId !== paramTargetId
      );
      return Promise.resolve({} as T);
    }
    if (method === "Page.getNavigationHistory") {
      return Promise.resolve({
        currentIndex: 1,
        entries: [{ id: 11 }, { id: 22 }, { id: 33 }],
      } as T);
    }
    return Promise.resolve({} as T);
  }

  startScreencast(
    _sessionId: string,
    onFrame: (frame: ChromiumScreencastFrame) => void,
    options: Record<string, unknown> = {}
  ) {
    this.screencastStarts.push(options);
    this.frameSink = onFrame;
    return Promise.resolve(() => {
      this.screencastStops += 1;
      return Promise.resolve();
    });
  }
}

class FakeSupervisor implements BrokeredSupervisor {
  readonly browser: FakeBrowser;
  executable: string | undefined = "/usr/bin/fake-chromium";
  findExecutableCalls = 0;
  readonly snapshots: (readonly string[] | undefined)[] = [];

  constructor(browser = new FakeBrowser()) {
    this.browser = browser;
  }

  browserFor(_ownerId: string): Promise<BrokeredBrowser> {
    return Promise.resolve(this.browser);
  }

  findExecutable() {
    this.findExecutableCalls += 1;
    return Promise.resolve(this.executable);
  }

  restoredTargets(_ownerId: string): readonly string[] {
    return [];
  }

  snapshotTargets(_ownerId: string, targetIdOrder?: readonly string[]) {
    this.snapshots.push(targetIdOrder);
    return Promise.resolve();
  }
}

class FakeViewClient implements BrowserViewClient {
  closes: { code: number | undefined; reason: string | undefined }[] = [];
  sent: string[] = [];

  close(code?: number, reason?: string) {
    this.closes.push({ code, reason });
  }

  send(data: string) {
    this.sent.push(data);
  }

  frames() {
    return this.sent
      .map((raw) => JSON.parse(raw) as { type: string; data?: string })
      .filter((message) => message.type === "frame");
  }
}

const service = (
  overrides: {
    readonly enabled?: boolean;
    readonly now?: () => number;
    readonly supervisor?: FakeSupervisor;
    readonly viewSessionTtl?: number;
  } = {}
) => {
  const supervisor = overrides.supervisor ?? new FakeSupervisor();
  return {
    browser: supervisor.browser,
    service: new BrowserService({
      enabled: overrides.enabled ?? true,
      ...(overrides.now ? { now: overrides.now } : {}),
      supervisor,
      ...(overrides.viewSessionTtl
        ? { viewSessionTtl: overrides.viewSessionTtl }
        : {}),
    }),
    supervisor,
  };
};

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });

const leaseToken = (path: string) => {
  const [, , , , token] = path.split("/");
  return token ?? "";
};

describe("VibePad Browser broker", () => {
  it("adds browser responses to the host CORS contract", async () => {
    const handler = createRequestHandler(
      {} as HarnessAdapter,
      "vibepad-test",
      undefined,
      undefined,
      service().service
    );

    const response = await handler(
      new Request("http://vibepad.test/v1/browser")
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("reports malformed browser input as a client request error", async () => {
    const handler = createRequestHandler(
      {} as HarnessAdapter,
      "vibepad-test",
      undefined,
      undefined,
      service().service
    );

    const response = await handler(
      new Request("http://vibepad.test/v1/browser/targets", {
        body: JSON.stringify({ url: "not a URL" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "invalid_request",
    });
  });

  it("reports an intentionally disabled browser without probing the supervisor", async () => {
    const { service: browser, supervisor } = service({ enabled: false });

    await expect(browser.state()).resolves.toEqual({
      available: false,
      canGoBack: false,
      canGoForward: false,
      healthy: false,
      targets: [],
    });
    expect(supervisor.findExecutableCalls).toBe(0);
  });

  it("reports a missing Chromium as unavailable and refuses view leases", async () => {
    const supervisor = new FakeSupervisor();
    supervisor.executable = undefined;
    const { service: browser } = service({ supervisor });

    await expect(browser.state()).resolves.toMatchObject({ available: false });
    await expect(browser.createViewSession()).rejects.toMatchObject({
      code: "browser_not_available",
      status: 503,
    });
  });

  it("serves the self-contained viewer only through a live view lease", async () => {
    let now = 1000;
    const { service: browser } = service({ now: () => now });
    const session = await browser.createViewSession();

    expect(session.path.startsWith("/v1/browser/view/")).toBe(true);
    expect(session.path.endsWith("/index.html")).toBe(true);

    const url = new URL(session.path, "http://vibepad.test");
    const page = browser.handleViewAsset(new Request(url), url);
    expect(page.headers.get("Content-Type")).toContain("text/html");
    const html = await page.text();
    expect(html).toContain("<canvas");
    expect(html).toContain("/v1/browser/socket/");
    expect(html).not.toContain("http://");

    now = Date.parse(session.expiresAt) + 1;
    expect(() => browser.handleViewAsset(new Request(url), url)).toThrow(
      expect.objectContaining({
        code: "browser_view_unauthorized",
        status: 401,
      })
    );
  });

  it("expires view leases for socket authorization at their deadline", async () => {
    let now = 5000;
    const { service: browser } = service({ now: () => now });
    const session = await browser.createViewSession();
    const token = leaseToken(session.path);
    const socketPath = `/v1/browser/socket/${token}`;

    expect(browser.isSocketRequest(socketPath)).toBe(true);
    expect(browser.authorizeSocket(socketPath)).toBe(true);

    now = Date.parse(session.expiresAt) + 1;
    expect(browser.authorizeSocket(socketPath)).toBe(false);
    expect(browser.connectView(socketPath, new FakeViewClient())).toBe(
      undefined
    );
  });

  it("invalidates live browser views when their paired device is revoked", async () => {
    const { service: browser } = service();
    const session = await browser.createViewSession({
      clientMetadata: {
        appId: "studio.peacockery.vibepad",
        appVersion: "1.0.0",
        clientVersion: "1.0.0",
        deviceModel: "iPad",
        installationId: "installation-1",
        osVersion: "26.0",
        platform: "ios",
      },
      deviceId: "device-1",
      deviceName: "Fixture iPad",
    });
    const token = leaseToken(session.path);
    const socketPath = `/v1/browser/socket/${token}`;
    const client = new FakeViewClient();
    const connection = browser.connectView(socketPath, client);

    expect(connection).toBeDefined();
    expect(browser.authorizeSocket(socketPath)).toBe(true);

    browser.revokeDevice("device-1");

    expect(browser.authorizeSocket(socketPath)).toBe(false);
    expect(client.closes).toEqual([
      { code: 1000, reason: "This device was revoked" },
    ]);
  });

  it("closes a connected view when its lease reaches expiry", async () => {
    const { service: browser } = service({ viewSessionTtl: 20 });
    const session = await browser.createViewSession();
    const token = leaseToken(session.path);
    const client = new FakeViewClient();
    const connection = browser.connectView(
      `/v1/browser/socket/${token}`,
      client
    );

    expect(connection).toBeDefined();
    await wait(60);
    expect(client.closes).toEqual([
      { code: 1000, reason: "Browser view session expired" },
    ]);
  });

  it("maps target operations onto supervised CDP tabs in creation order", async () => {
    const { browser: fake, service: browser, supervisor } = service();

    const first = await browser.createTarget("https://first.example/");
    const second = await browser.createTarget("https://second.example/");
    expect(first.url).toBe("https://first.example/");

    // The fake enumerates newest-first; creation order must win.
    await expect(browser.state()).resolves.toMatchObject({
      activeTargetId: second.id,
      available: true,
      healthy: true,
      targets: [
        { id: first.id, url: "https://first.example/" },
        { id: second.id, url: "https://second.example/" },
      ],
    });

    await browser.performAction(first.id, { action: "activate" });
    expect(fake.commands).toContainEqual({
      method: "Target.activateTarget",
      params: { targetId: first.id },
      sessionId: undefined,
    });

    await browser.performAction(first.id, {
      action: "navigate",
      url: "https://third.example/",
    });
    // Targets created through the broker reuse their createTab session.
    expect(fake.commands).toContainEqual({
      method: "Page.navigate",
      params: { url: "https://third.example/" },
      sessionId: "session-1",
    });

    await browser.performAction(first.id, { action: "back" });
    expect(fake.commands).toContainEqual({
      method: "Page.navigateToHistoryEntry",
      params: { entryId: 11 },
      sessionId: "session-1",
    });

    await browser.closeTarget(second.id);
    expect(fake.targets.map((target) => target.url)).toEqual([
      "https://first.example/",
    ]);
    expect(supervisor.snapshots.length).toBeGreaterThan(0);
    expect(supervisor.snapshots.at(-1)).toEqual([first.id]);
  });

  it("retains a blank target when the final page closes", async () => {
    const { browser: fake, service: browser } = service();
    const only = await browser.createTarget("https://only.example/");

    await browser.closeTarget(only.id);

    expect(fake.targets.map((target) => target.url)).toEqual(["about:blank"]);
    await expect(
      browser.performAction(only.id, { action: "reload" })
    ).rejects.toMatchObject({
      code: "browser_target_not_found",
      status: 404,
    });
  });

  it("streams ack-paced frames and forwards input over a view connection", async () => {
    const { browser: fake, service: browser } = service();
    await browser.createTarget("https://viewed.example/");
    const session = await browser.createViewSession();
    const token = leaseToken(session.path);
    const client = new FakeViewClient();
    const connection = browser.connectView(
      `/v1/browser/socket/${token}`,
      client
    );
    expect(connection).toBeDefined();
    if (!connection) {
      return;
    }

    connection.message(
      JSON.stringify({
        deviceScaleFactor: 2,
        height: 480,
        type: "viewport",
        width: 640,
      })
    );
    await wait(20);

    expect(fake.commands).toContainEqual(
      expect.objectContaining({
        method: "Emulation.setDeviceMetricsOverride",
        params: {
          deviceScaleFactor: 2,
          height: 480,
          mobile: false,
          width: 640,
        },
      })
    );
    expect(fake.screencastStarts).toEqual([
      { maxHeight: 960, maxWidth: 1280, quality: 60 },
    ]);

    const frame = (data: string): ChromiumScreencastFrame => ({
      data,
      metadata: {
        deviceHeight: 480,
        deviceWidth: 640,
        offsetTop: 0,
        pageScaleFactor: 1,
        scrollOffsetX: 0,
        scrollOffsetY: 0,
      },
    });
    fake.frameSink?.(frame("first"));
    fake.frameSink?.(frame("second"));
    fake.frameSink?.(frame("third"));
    expect(client.frames().map((message) => message.data)).toEqual(["first"]);

    connection.message(JSON.stringify({ type: "ack" }));
    expect(client.frames().map((message) => message.data)).toEqual([
      "first",
      "third",
    ]);

    connection.message(
      JSON.stringify({
        input: {
          button: "left",
          clickCount: 1,
          kind: "mouse",
          modifiers: 0,
          type: "mousePressed",
          x: 100,
          y: 120,
        },
        type: "input",
      })
    );
    connection.message(
      JSON.stringify({
        input: {
          code: "KeyA",
          key: "a",
          kind: "key",
          modifiers: 0,
          text: "a",
          type: "keyDown",
        },
        type: "input",
      })
    );
    connection.message(
      JSON.stringify({
        input: {
          kind: "touch",
          modifiers: 0,
          touchPoints: [{ id: 0, x: 10, y: 20 }],
          type: "touchStart",
        },
        type: "input",
      })
    );
    await wait(10);

    expect(fake.commands).toContainEqual(
      expect.objectContaining({
        method: "Input.dispatchMouseEvent",
        params: expect.objectContaining({
          button: "left",
          type: "mousePressed",
          x: 100,
          y: 120,
        }),
      })
    );
    expect(fake.commands).toContainEqual(
      expect.objectContaining({
        method: "Input.dispatchKeyEvent",
        params: expect.objectContaining({
          key: "a",
          text: "a",
          type: "keyDown",
          windowsVirtualKeyCode: 65,
        }),
      })
    );
    expect(fake.commands).toContainEqual(
      expect.objectContaining({
        method: "Input.dispatchTouchEvent",
        params: expect.objectContaining({ type: "touchStart" }),
      })
    );

    connection.closed();
    expect(fake.screencastStops).toBe(1);
  });

  it("rejects malformed view messages by closing the connection", async () => {
    const { service: browser } = service();
    const session = await browser.createViewSession();
    const token = leaseToken(session.path);
    const client = new FakeViewClient();
    const connection = browser.connectView(
      `/v1/browser/socket/${token}`,
      client
    );

    connection?.message('{"type":"viewport","width":-5}');

    expect(client.closes).toEqual([
      { code: 1008, reason: "Invalid browser view message" },
    ]);
  });
});
