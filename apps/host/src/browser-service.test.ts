import type { HarnessAdapter } from "@vibepad/protocol/provider";
import { describe, expect, it } from "vitest";

import { BrowserService } from "./browser-service";
import { createRequestHandler } from "./http";

const target = {
  id: "target-1",
  title: "Example Domain",
  type: "page",
  url: "https://example.com/",
};

describe("VibePad Browser broker", () => {
  it("adds browser responses to the host CORS contract", async () => {
    const service = new BrowserService({
      cdpUrl: "http://127.0.0.1:19223",
      enabled: true,
      fetcher: () => Promise.resolve(Response.json([])),
      surfaceUrl: "http://127.0.0.1:16901",
    });
    const handler = createRequestHandler(
      {} as HarnessAdapter,
      "vibepad-test",
      undefined,
      undefined,
      service
    );

    const response = await handler(
      new Request("http://vibepad.test/v1/browser")
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("reports malformed browser input as a client request error", async () => {
    const service = new BrowserService({
      cdpUrl: "http://127.0.0.1:19223",
      enabled: true,
      surfaceUrl: "http://127.0.0.1:16901",
    });
    const handler = createRequestHandler(
      {} as HarnessAdapter,
      "vibepad-test",
      undefined,
      undefined,
      service
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

  it("reports an intentionally disabled browser without probing upstream", async () => {
    const requests: string[] = [];
    const service = new BrowserService({
      enabled: false,
      fetcher: (input) => {
        requests.push(String(input));
        return Promise.resolve(Response.json([]));
      },
    });

    await expect(service.state()).resolves.toEqual({
      available: false,
      canGoBack: false,
      canGoForward: false,
      healthy: false,
      targets: [],
    });
    expect(requests).toEqual([]);
  });

  it("proxies Kasm assets only through a live VibePad view session", async () => {
    let now = 1000;
    const requests: string[] = [];
    const service = new BrowserService({
      cdpUrl: "http://127.0.0.1:19223",
      enabled: true,
      fetcher: (input) => {
        requests.push(String(input));
        return Promise.resolve(
          new Response("<html>VibePad Browser</html>", {
            headers: { "Content-Type": "text/html" },
          })
        );
      },
      now: () => now,
      surfaceUrl: "http://127.0.0.1:16901",
    });
    const session = service.createViewSession();
    const url = new URL(session.path, "http://vibepad.test");

    const response = await service.handleViewAsset(new Request(url), url);

    expect(await response.text()).toContain("VibePad Browser");
    expect(requests).toEqual([`http://127.0.0.1:16901/vnc.html${url.search}`]);

    now = Date.parse(session.expiresAt) + 1;
    await expect(
      service.handleViewAsset(new Request(url), url)
    ).rejects.toMatchObject({
      code: "browser_view_unauthorized",
      status: 401,
    });
  });

  it("invalidates live browser views when their paired device is revoked", () => {
    const service = new BrowserService({
      cdpUrl: "http://127.0.0.1:19223",
      enabled: true,
      surfaceUrl: "http://127.0.0.1:16901",
    });
    const session = service.createViewSession({
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
    const socketPath = new URL(
      session.path,
      "http://vibepad.test"
    ).searchParams.get("path");

    expect(socketPath).toBeTruthy();
    expect(service.authorizeSocket(`/${socketPath}`)).toBe(true);

    service.revokeDevice("device-1");

    expect(service.authorizeSocket(`/${socketPath}`)).toBe(false);
  });

  it("maps real CDP page targets and controls their lifecycle", async () => {
    const requests: { readonly method: string; readonly url: string }[] = [];
    const service = new BrowserService({
      cdpUrl: "http://127.0.0.1:19223",
      enabled: true,
      fetcher: (input, init) => {
        const url = String(input);
        requests.push({ method: init?.method ?? "GET", url });
        if (url.endsWith("/json/list")) {
          return Promise.resolve(
            Response.json([
              target,
              {
                id: "worker-1",
                title: "worker",
                type: "service_worker",
                url: "https://example.com/worker.js",
              },
            ])
          );
        }
        if (url.includes("/json/new?")) {
          return Promise.resolve(
            Response.json({
              ...target,
              id: "target-2",
              title: "Example Org",
              url: "https://example.org/",
            })
          );
        }
        return Promise.resolve(new Response("ok"));
      },
      surfaceUrl: "http://127.0.0.1:16901",
    });

    await expect(service.state()).resolves.toMatchObject({
      activeTargetId: "target-1",
      healthy: true,
      targets: [
        {
          id: "target-1",
          title: "Example Domain",
          url: "https://example.com/",
        },
      ],
    });
    await expect(service.createTarget("https://example.org/")).resolves.toEqual(
      {
        id: "target-2",
        title: "Example Org",
        url: "https://example.org/",
      }
    );
    await service.performAction("target-2", { action: "activate" });
    await service.closeTarget("target-2");

    expect(requests).toContainEqual({
      method: "PUT",
      url: "http://127.0.0.1:19223/json/new?https%3A%2F%2Fexample.org%2F",
    });
    expect(requests.some(({ url }) => url.endsWith("/activate/target-2"))).toBe(
      true
    );
    expect(requests.some(({ url }) => url.endsWith("/close/target-2"))).toBe(
      true
    );
  });

  it("retains a blank target when the final page closes", async () => {
    const requests: { readonly method: string; readonly url: string }[] = [];
    const service = new BrowserService({
      cdpUrl: "http://127.0.0.1:19223",
      enabled: true,
      fetcher: (input, init) => {
        const url = String(input);
        requests.push({ method: init?.method ?? "GET", url });
        return Promise.resolve(
          url.endsWith("/json/list")
            ? Response.json([target])
            : new Response("ok")
        );
      },
      surfaceUrl: "http://127.0.0.1:16901",
    });

    await service.closeTarget(target.id);

    expect(requests).toContainEqual({
      method: "PUT",
      url: "http://127.0.0.1:19223/json/new?about%3Ablank",
    });
    expect(requests.at(-1)?.url).toBe(
      "http://127.0.0.1:19223/json/close/target-1"
    );
  });
});
