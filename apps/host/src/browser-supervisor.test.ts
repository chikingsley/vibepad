import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import {
  BrowserSupervisor,
  browserSupervisorPaths,
  canonicalOwnerId,
} from "./browser-supervisor";
import {
  type ChromiumBrowser,
  findChromiumExecutable,
} from "./chromium-browser";

const loopbackCdpEndpointPattern = /^http:\/\/127\.0\.0\.1:\d+$/;

const waitForOrigin = async (
  browser: ChromiumBrowser,
  sessionId: string,
  origin: string,
  timeoutMilliseconds: number
) => {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() <= deadline) {
    // biome-ignore lint/performance/noAwaitInLoops: The page is polled until its navigation commits.
    const href = await browser.evaluate(sessionId, "location.href");
    if (typeof href === "string" && href.startsWith(origin)) {
      return;
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 100);
    });
  }
  throw new Error(
    `Page did not reach ${origin} within ${timeoutMilliseconds}ms`
  );
};

const waitForCookie = (
  browser: ChromiumBrowser,
  name: string,
  timeoutMilliseconds: number
) =>
  new Promise<void>((resolve, reject) => {
    const deadline = Date.now() + timeoutMilliseconds;
    const poll = () => {
      browser.exportCookies().then((cookies) => {
        // biome-ignore lint/complexity/useLiteralKeys: strict index-signature access is required by the shared TypeScript config.
        if (cookies.some((cookie) => cookie["name"] === name)) {
          resolve();
          return;
        }
        if (Date.now() > deadline) {
          reject(
            new Error(
              `Cookie ${name} not visible within ${timeoutMilliseconds}ms`
            )
          );
          return;
        }
        setTimeout(poll, 100);
      }, reject);
    };
    poll();
  });

describe("browser supervisor paths and guards", () => {
  it("separates profiles and journals under one data directory", () => {
    const paths = browserSupervisorPaths("linux", "/home/probe");
    expect(paths.dataDirectory).toBe(
      "/home/probe/.local/share/vibepad/chromium"
    );
    expect(paths.profilesDirectory).toBe(
      "/home/probe/.local/share/vibepad/chromium/profiles"
    );
    expect(paths.journalDirectory).toBe(
      "/home/probe/.local/share/vibepad/chromium/targets"
    );
  });

  it("rejects owner ids that cannot be path segments", async () => {
    const supervisor = new BrowserSupervisor({
      executable: "/usr/bin/true",
    });
    await expect(supervisor.browserFor("../escape")).rejects.toThrow(
      "Invalid browser owner id"
    );
  });

  it("explains a missing browser instead of failing cryptically", async () => {
    const supervisor = new BrowserSupervisor({
      executableFinder: () => Promise.resolve(undefined),
    });
    await expect(supervisor.browserFor("session-a")).rejects.toThrow(
      "VIBEPAD_CHROMIUM_EXECUTABLE"
    );
  });
});

const executable = await findChromiumExecutable();

// CI must exercise a real browser. Only local machines may skip these suites.
// biome-ignore lint/complexity/useLiteralKeys: strict index-signature access is required by the shared TypeScript config.
const skipLiveBrowser = !(executable || process.env["CI"]);

describe.skipIf(skipLiveBrowser)("supervising real session browsers", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterAll(async () => {
    for (const cleanup of cleanups.reverse()) {
      // biome-ignore lint/performance/noAwaitInLoops: Cleanup order matters.
      await cleanup();
    }
  });

  it("keeps logins, tabs, and lifecycles per owner", async () => {
    const dataDirectory = await mkdtemp(join(tmpdir(), "vibepad-supervisor-"));
    cleanups.push(() => rm(dataDirectory, { force: true, recursive: true }));
    const supervisor = new BrowserSupervisor({
      executable: executable as string,
      paths: {
        agentBrowserDirectory: join(dataDirectory, "agent-browser"),
        dataDirectory,
        journalDirectory: join(dataDirectory, "targets"),
        profilesDirectory: join(dataDirectory, "profiles"),
      },
    });
    const server = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "text/html" });
      response.end("<title>supervised</title><body>ok</body>");
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    cleanups.push(
      () =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        })
    );
    // Cleanups run in reverse, so the browsers stop before the server closes;
    // close() would otherwise wait on sockets the live browsers still hold.
    cleanups.push(() => supervisor.stopAll());
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;

    const [first, second] = await Promise.all([
      supervisor.browserFor("session-a"),
      supervisor.browserFor("session-a"),
    ]);
    expect(first).toBe(second);

    const canonical = await supervisor.browserFor(canonicalOwnerId);
    const canonicalTab = await canonical.createTab(origin);
    // Setting document.cookie before the HTTP origin commits is a no-op on
    // the initial blank document, so the navigation is awaited first.
    await waitForOrigin(canonical, canonicalTab.sessionId, origin, 20_000);
    await canonical.evaluate(
      canonicalTab.sessionId,
      'document.cookie = "vibepad_login=seeded; path=/"'
    );
    // Cookie visibility through Storage.getCookies can lag well past ten
    // seconds when other suites run beside this one on a loaded machine.
    await waitForCookie(canonical, "vibepad_login", 30_000);

    const agentBrowserConfig = JSON.parse(
      await readFile(
        join(dataDirectory, "agent-browser", "canonical.json"),
        "utf8"
      )
    ) as { cdp: string; session: string };
    expect(agentBrowserConfig.cdp).toMatch(loopbackCdpEndpointPattern);
    expect(agentBrowserConfig.session).toBe("vibepad-live");

    const seeded = await supervisor.browserFor("session-b");
    const seededCookies = await seeded.exportCookies();
    expect(
      // biome-ignore lint/complexity/useLiteralKeys: strict index-signature access is required by the shared TypeScript config.
      seededCookies.some((cookie) => cookie["name"] === "vibepad_login")
    ).toBe(true);

    await seeded.createTab(origin);
    await supervisor.stop("session-b");
    const journal = await readFile(
      join(dataDirectory, "targets", "session-b.json"),
      "utf8"
    );
    expect(journal).toContain(origin);

    const relaunched = await supervisor.browserFor("session-b");
    const targets = await relaunched.listTargets();
    expect(targets.some((target) => target.url === origin)).toBe(true);

    await supervisor.remove("session-b");
    await expect(
      stat(join(dataDirectory, "profiles", "session-b"))
    ).rejects.toThrow();
    expect(supervisor.runningOwners()).not.toContain("session-b");
  }, 90_000);
});
