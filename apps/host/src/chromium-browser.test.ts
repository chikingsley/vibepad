import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import {
  ChromiumBrowser,
  type ChromiumScreencastFrame,
  chromiumExecutableCandidates,
  findChromiumExecutable,
} from "./chromium-browser";

const tallPage = `data:text/html,${encodeURIComponent(
  '<title>scroll probe</title><body style="margin:0;height:6000px;background:linear-gradient(red,blue)"><h1>top</h1></body>'
)}`;

const waitForFrame = (
  frames: ChromiumScreencastFrame[],
  matches: (frame: ChromiumScreencastFrame) => boolean,
  timeoutMilliseconds: number
) =>
  new Promise<ChromiumScreencastFrame>((resolve, reject) => {
    const deadline = Date.now() + timeoutMilliseconds;
    const poll = () => {
      const found = frames.find(matches);
      if (found) {
        resolve(found);
        return;
      }
      if (Date.now() > deadline) {
        reject(
          new Error(
            `No matching screencast frame within ${timeoutMilliseconds}ms`
          )
        );
        return;
      }
      setTimeout(poll, 100);
    };
    poll();
  });

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
  new Promise<Record<string, unknown>[]>((resolve, reject) => {
    const deadline = Date.now() + timeoutMilliseconds;
    const poll = () => {
      browser.exportCookies().then((cookies) => {
        // biome-ignore lint/complexity/useLiteralKeys: strict index-signature access is required by the shared TypeScript config.
        if (cookies.some((cookie) => cookie["name"] === name)) {
          resolve(cookies);
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

describe("finding a Chromium executable", () => {
  it("prefers the configured executable", async () => {
    const directory = await mkdtemp(join(tmpdir(), "vibepad-chromium-"));
    const fake = join(directory, "fake-chromium");
    await writeFile(fake, "#!/bin/sh\n", { mode: 0o755 });
    await chmod(fake, 0o755);

    const found = await findChromiumExecutable(
      { VIBEPAD_CHROMIUM_EXECUTABLE: fake },
      []
    );

    expect(found).toBe(fake);
    await rm(directory, { force: true, recursive: true });
  });

  it("prefers packaged Chrome on Linux, which can start its own sandbox", () => {
    const candidates = chromiumExecutableCandidates("linux");
    expect(candidates.indexOf("/usr/bin/google-chrome")).toBeLessThan(
      candidates.indexOf("/usr/bin/chromium")
    );
  });

  it("returns undefined when nothing is executable", async () => {
    const found = await findChromiumExecutable({}, ["/nonexistent/browser"]);
    expect(found).toBeUndefined();
  });
});

const executable = await findChromiumExecutable();

// CI must exercise a real browser. Only local machines may skip these suites.
// biome-ignore lint/complexity/useLiteralKeys: strict index-signature access is required by the shared TypeScript config.
const skipLiveBrowser = !(executable || process.env["CI"]);

describe.skipIf(skipLiveBrowser)("driving a real Chromium over CDP", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterAll(async () => {
    for (const cleanup of cleanups.reverse()) {
      // biome-ignore lint/performance/noAwaitInLoops: Cleanup order matters.
      await cleanup();
    }
  });

  it("streams screencast frames whose metadata tracks page scroll", async () => {
    const profileDirectory = await mkdtemp(
      join(tmpdir(), "vibepad-chromium-profile-")
    );
    cleanups.push(() => rm(profileDirectory, { force: true, recursive: true }));
    const browser = await ChromiumBrowser.launch({
      executable: executable as string,
      profileDirectory,
    });
    cleanups.push(() => browser.close());

    const tab = await browser.createTab(tallPage);
    const frames: ChromiumScreencastFrame[] = [];
    const stopScreencast = await browser.startScreencast(
      tab.sessionId,
      (frame) => {
        frames.push(frame);
      }
    );

    const first = await waitForFrame(frames, () => true, 10_000);
    expect(first.data.length).toBeGreaterThan(1000);
    expect(first.metadata.deviceWidth).toBeGreaterThan(0);
    expect(first.metadata.scrollOffsetY).toBe(0);

    await browser.evaluate(tab.sessionId, "window.scrollTo(0, 2000)");
    const scrolled = await waitForFrame(
      frames,
      (frame) => frame.metadata.scrollOffsetY > 1500,
      10_000
    );
    expect(scrolled.metadata.scrollOffsetY).toBeGreaterThan(1500);

    const title = await browser.evaluate(tab.sessionId, "document.title");
    expect(title).toBe("scroll probe");
    await stopScreencast();
  }, 45_000);

  it("seeds a second browser's logins from the canonical cookie jar", async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "text/html" });
      response.end("<title>login probe</title><body>ok</body>");
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
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;

    const canonicalProfile = await mkdtemp(
      join(tmpdir(), "vibepad-canonical-")
    );
    cleanups.push(() => rm(canonicalProfile, { force: true, recursive: true }));
    const canonical = await ChromiumBrowser.launch({
      executable: executable as string,
      profileDirectory: canonicalProfile,
    });
    cleanups.push(() => canonical.close());
    const canonicalTab = await canonical.createTab(origin);
    // Setting document.cookie before the HTTP origin commits is a no-op on
    // the initial blank document, so the navigation is awaited first.
    await waitForOrigin(canonical, canonicalTab.sessionId, origin, 20_000);
    await canonical.evaluate(
      canonicalTab.sessionId,
      'document.cookie = "vibepad_login=canonical-secret; path=/"'
    );

    // Cookie visibility through Storage.getCookies can lag well past ten
    // seconds when other suites run beside this one on a loaded machine.
    const exported = await waitForCookie(canonical, "vibepad_login", 30_000);

    const sessionProfile = await mkdtemp(join(tmpdir(), "vibepad-session-"));
    cleanups.push(() => rm(sessionProfile, { force: true, recursive: true }));
    const sessionBrowser = await ChromiumBrowser.launch({
      executable: executable as string,
      profileDirectory: sessionProfile,
    });
    cleanups.push(() => sessionBrowser.close());
    await sessionBrowser.importCookies(exported);

    const sessionTab = await sessionBrowser.createTab(origin);
    const sessionCookie = await sessionBrowser.evaluate(
      sessionTab.sessionId,
      "document.cookie"
    );
    expect(sessionCookie).toContain("vibepad_login=canonical-secret");
  }, 90_000);
});
