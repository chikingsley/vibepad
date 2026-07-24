import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import {
  ChromiumBrowser,
  type ChromiumScreencastFrame,
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

  it("returns undefined when nothing is executable", async () => {
    const found = await findChromiumExecutable({}, ["/nonexistent/browser"]);
    expect(found).toBeUndefined();
  });
});

const executable = await findChromiumExecutable();

describe.skipIf(!executable)("driving a real Chromium over CDP", () => {
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
});
