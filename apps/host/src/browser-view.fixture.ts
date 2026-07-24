/**
 * Real-Chromium broker integration fixture.
 *
 * Runs under Bun (the vitest suite spawns it) because the production view
 * socket is served by Bun.serve. It boots the real host HTTP handler plus the
 * browser view bridge on loopback, drives the client-facing browser contract
 * over real HTTP, opens the leased view WebSocket, receives real screencast
 * frames, forwards synthetic input, and proves through page evaluation that
 * the input landed and the viewport override genuinely reflowed the page.
 * The collected evidence is printed as one JSON document on stdout.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HarnessAdapter } from "@vibepad/protocol/provider";
import { type Server, serve } from "bun";

import { BrowserService } from "./browser-service";
import { BrowserSupervisor, canonicalOwnerId } from "./browser-supervisor";
import {
  BrowserViewBridge,
  type BrowserViewSocketData,
} from "./browser-view-bridge";
import type { ChromiumScreencastMetadata } from "./chromium-browser";
import { createRequestHandler } from "./http";

const guard = setTimeout(() => {
  console.error("browser-view fixture timed out");
  process.exit(1);
}, 90_000);

const poll = async <T>(
  label: string,
  probe: () => Promise<T | undefined>,
  timeoutMilliseconds = 15_000
): Promise<T> => {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() <= deadline) {
    // biome-ignore lint/performance/noAwaitInLoops: The live browser is polled until it converges.
    const value = await probe();
    if (value !== undefined) {
      return value;
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 100);
    });
  }
  throw new Error(`${label} did not converge within ${timeoutMilliseconds}ms`);
};

const probePage = `<!doctype html><title>broker probe</title>
<body style="margin:0">
<input id="field" style="position:fixed;left:0;top:0;width:200px;height:50px">
<script>
window.__clicks = [];
addEventListener("mousedown", (event) => {
  window.__clicks.push([event.clientX, event.clientY]);
});
</script>
</body>`;

const pageServer = createServer((_request, response) => {
  response.writeHead(200, { "content-type": "text/html" });
  response.end(probePage);
});
await new Promise<void>((resolve) => {
  pageServer.listen(0, "127.0.0.1", resolve);
});
const pageOrigin = `http://127.0.0.1:${(pageServer.address() as AddressInfo).port}/`;

const dataDirectory = await mkdtemp(join(tmpdir(), "vibepad-view-fixture-"));
const supervisor = new BrowserSupervisor({
  paths: {
    agentBrowserDirectory: join(dataDirectory, "agent-browser"),
    dataDirectory,
    journalDirectory: join(dataDirectory, "targets"),
    profilesDirectory: join(dataDirectory, "profiles"),
  },
});
const browserService = new BrowserService({ enabled: true, supervisor });
const bridge = new BrowserViewBridge(browserService);
const requestHandler = createRequestHandler(
  {} as HarnessAdapter,
  "vibepad-view-fixture",
  undefined,
  undefined,
  browserService
);

const host = serve<BrowserViewSocketData>({
  fetch(request, bunServer) {
    const { pathname } = new URL(request.url);
    if (browserService.isSocketRequest(pathname)) {
      return bridge.handleUpgrade(
        request,
        bunServer as unknown as Server<BrowserViewSocketData>
      );
    }
    return requestHandler(request, bunServer);
  },
  hostname: "127.0.0.1",
  port: 0,
  websocket: bridge.websocket,
});
const hostOrigin = `http://127.0.0.1:${host.port}`;

interface FrameMessage {
  readonly data: string;
  readonly metadata: ChromiumScreencastMetadata;
  readonly type: "frame";
}

const frames: FrameMessage[] = [];
let socket: WebSocket | undefined;

const hostRequest = async (path: string, init?: RequestInit) => {
  const response = await fetch(`${hostOrigin}${path}`, init);
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}`);
  }
  return response;
};

const cleanup = async () => {
  socket?.close();
  host.stop(true);
  await supervisor.stopAll();
  await new Promise<void>((resolve) => {
    pageServer.close(() => resolve());
  });
  await rm(dataDirectory, { force: true, recursive: true });
};

try {
  const targetResponse = await hostRequest("/v1/browser/targets", {
    body: JSON.stringify({ url: pageOrigin }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const target = (
    (await targetResponse.json()) as {
      data: { id: string; url: string };
    }
  ).data;

  const stateResponse = await hostRequest("/v1/browser");
  const state = (
    (await stateResponse.json()) as {
      data: {
        activeTargetId?: string;
        available: boolean;
        healthy: boolean;
        targets: { id: string; url: string }[];
      };
    }
  ).data;

  const leaseResponse = await hostRequest("/v1/browser/view-sessions", {
    body: "{}",
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const lease = (
    (await leaseResponse.json()) as {
      data: { expiresAt: string; path: string };
    }
  ).data;

  const viewerResponse = await hostRequest(lease.path);
  const viewerHtml = await viewerResponse.text();
  const token = lease.path.split("/")[4] ?? "";

  socket = new WebSocket(
    `ws://127.0.0.1:${host.port}/v1/browser/socket/${token}`
  );
  const view = socket;
  view.addEventListener("message", (event) => {
    if (typeof event.data !== "string") {
      return;
    }
    const message = JSON.parse(event.data) as { type?: string };
    if (message.type === "frame") {
      frames.push(message as FrameMessage);
      view.send(JSON.stringify({ type: "ack" }));
    }
  });
  await new Promise<void>((resolve, reject) => {
    view.addEventListener("open", () => resolve(), { once: true });
    view.addEventListener(
      "error",
      () => reject(new Error("view socket failed")),
      { once: true }
    );
  });
  const sendInput = (input: Record<string, unknown>) => {
    view.send(JSON.stringify({ input, type: "input" }));
  };
  view.send(
    JSON.stringify({
      deviceScaleFactor: 1,
      height: 480,
      type: "viewport",
      width: 640,
    })
  );

  const firstFrame = await poll("first screencast frame", () =>
    Promise.resolve(frames.find((frame) => frame.metadata.deviceWidth === 640))
  );

  const chromium = supervisor.runningBrowser(canonicalOwnerId);
  if (!chromium) {
    throw new Error("the canonical browser is not running");
  }
  const attached = await chromium.send<{ sessionId: string }>(
    "Target.attachToTarget",
    { flatten: true, targetId: target.id }
  );
  const proofSession = attached.sessionId;

  const reflowWidth = await poll("device metrics reflow", async () => {
    const width = await chromium.evaluate(proofSession, "window.innerWidth");
    return width === 640 ? width : undefined;
  });

  const clickPoint = { x: 50, y: 25 };
  sendInput({
    button: "left",
    clickCount: 1,
    kind: "mouse",
    modifiers: 0,
    type: "mousePressed",
    ...clickPoint,
  });
  sendInput({
    button: "left",
    clickCount: 1,
    kind: "mouse",
    modifiers: 0,
    type: "mouseReleased",
    ...clickPoint,
  });
  const recordedClicks = await poll("recorded click", async () => {
    const clicks = (await chromium.evaluate(
      proofSession,
      "JSON.stringify(window.__clicks)"
    )) as string;
    const parsed = JSON.parse(clicks) as [number, number][];
    return parsed.length > 0 ? parsed : undefined;
  });

  sendInput({
    code: "KeyV",
    key: "v",
    kind: "key",
    modifiers: 0,
    text: "v",
    type: "keyDown",
  });
  sendInput({
    code: "KeyV",
    key: "v",
    kind: "key",
    modifiers: 0,
    text: "",
    type: "keyUp",
  });
  const typedValue = await poll("typed key", async () => {
    const value = (await chromium.evaluate(
      proofSession,
      "document.getElementById('field').value"
    )) as string;
    return value.includes("v") ? value : undefined;
  });

  view.send(
    JSON.stringify({
      deviceScaleFactor: 1,
      height: 400,
      type: "viewport",
      width: 500,
    })
  );
  const resizedWidth = await poll("viewport resize reflow", async () => {
    const width = await chromium.evaluate(proofSession, "window.innerWidth");
    return width === 500 ? width : undefined;
  });
  const resizedFrame = await poll("resized screencast frame", () =>
    Promise.resolve(frames.find((frame) => frame.metadata.deviceWidth === 500))
  );

  console.log(
    JSON.stringify({
      clickPoint,
      firstFrameBytes: firstFrame.data.length,
      firstFrameMetadata: firstFrame.metadata,
      frameCount: frames.length,
      leasePath: lease.path,
      recordedClicks,
      reflowWidth,
      resizedFrameWidth: resizedFrame.metadata.deviceWidth,
      resizedWidth,
      state: {
        activeTargetId: state.activeTargetId,
        available: state.available,
        healthy: state.healthy,
        targetUrls: state.targets.map((entry) => entry.url),
      },
      targetId: target.id,
      typedValue,
      viewerHasCanvas: viewerHtml.includes("<canvas"),
      viewerHasSocketPath: viewerHtml.includes("/v1/browser/socket/"),
    })
  );
} finally {
  clearTimeout(guard);
  await cleanup();
}
process.exit(0);
