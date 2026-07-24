import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";

import { ChromiumBrowser, findChromiumExecutable } from "./chromium-browser";

export const canonicalOwnerId = "canonical";

const ownerIdPattern = /^[A-Za-z0-9._-]+$/u;
const restorableUrlPattern = /^https?:\/\//u;

interface TargetJournal {
  readonly urls: readonly string[];
  readonly version: 1;
}

export interface BrowserSupervisorPaths {
  readonly dataDirectory: string;
  readonly journalDirectory: string;
  readonly profilesDirectory: string;
}

export const browserSupervisorPaths = (
  targetPlatform = platform(),
  homeDirectory = homedir()
): BrowserSupervisorPaths => {
  const dataDirectory =
    targetPlatform === "darwin"
      ? join(
          homeDirectory,
          "Library",
          "Application Support",
          "VibePad",
          "chromium"
        )
      : join(homeDirectory, ".local", "share", "vibepad", "chromium");
  return {
    dataDirectory,
    journalDirectory: join(dataDirectory, "targets"),
    profilesDirectory: join(dataDirectory, "profiles"),
  };
};

const parseJournal = (value: string): TargetJournal | undefined => {
  try {
    const candidate = JSON.parse(value) as Partial<TargetJournal>;
    if (
      candidate.version === 1 &&
      Array.isArray(candidate.urls) &&
      candidate.urls.every(
        (url) => typeof url === "string" && restorableUrlPattern.test(url)
      )
    ) {
      return { urls: candidate.urls, version: 1 };
    }
  } catch {
    // An unreadable journal must not block the browser from starting.
  }
};

const requireOwnerId = (ownerId: string) => {
  if (!ownerIdPattern.test(ownerId)) {
    throw new Error(`Invalid browser owner id: ${ownerId}`);
  }
  return ownerId;
};

export class BrowserSupervisor {
  readonly #browsers = new Map<string, ChromiumBrowser>();
  #executable: string | undefined;
  readonly #executableFinder: () => Promise<string | undefined>;
  readonly #launching = new Map<string, Promise<ChromiumBrowser>>();
  readonly #paths: BrowserSupervisorPaths;

  constructor(
    options: {
      readonly executable?: string;
      readonly executableFinder?: () => Promise<string | undefined>;
      readonly paths?: BrowserSupervisorPaths;
    } = {}
  ) {
    this.#executable = options.executable;
    this.#executableFinder =
      options.executableFinder ?? (() => findChromiumExecutable());
    this.#paths = options.paths ?? browserSupervisorPaths();
  }

  async browserFor(ownerId: string): Promise<ChromiumBrowser> {
    requireOwnerId(ownerId);
    const running = this.#browsers.get(ownerId);
    if (running) {
      return running;
    }
    const launching = this.#launching.get(ownerId);
    if (launching) {
      return launching;
    }
    const launch = this.#launch(ownerId);
    this.#launching.set(ownerId, launch);
    try {
      const browser = await launch;
      this.#browsers.set(ownerId, browser);
      return browser;
    } finally {
      this.#launching.delete(ownerId);
    }
  }

  async remove(ownerId: string) {
    requireOwnerId(ownerId);
    await this.stop(ownerId);
    await rm(this.#profileDirectory(ownerId), {
      force: true,
      recursive: true,
    });
    await rm(this.#journalPath(ownerId), { force: true });
  }

  runningOwners() {
    return [...this.#browsers.keys()];
  }

  async snapshotTargets(ownerId: string) {
    const browser = this.#browsers.get(ownerId);
    if (!browser) {
      return;
    }
    try {
      const targets = await browser.listTargets();
      const urls = [
        ...new Set(
          targets
            .filter(
              (target) =>
                target.type === "page" && restorableUrlPattern.test(target.url)
            )
            .map((target) => target.url)
        ),
      ];
      const journalPath = this.#journalPath(ownerId);
      await mkdir(dirname(journalPath), { mode: 0o700, recursive: true });
      await writeFile(
        journalPath,
        `${JSON.stringify({ urls, version: 1 } satisfies TargetJournal, null, 2)}\n`,
        { mode: 0o600 }
      );
    } catch {
      // A dying browser must remain stoppable; the previous journal survives.
    }
  }

  async stop(ownerId: string) {
    const browser = this.#browsers.get(ownerId);
    if (!browser) {
      return;
    }
    await this.snapshotTargets(ownerId);
    this.#browsers.delete(ownerId);
    await browser.close();
  }

  async stopAll() {
    const owners = this.runningOwners();
    await Promise.all(owners.map((ownerId) => this.stop(ownerId)));
  }

  async #launch(ownerId: string): Promise<ChromiumBrowser> {
    this.#executable ??= await this.#executableFinder();
    if (!this.#executable) {
      throw new Error(
        "VibePad needs Google Chrome or Chromium installed on this computer; set VIBEPAD_CHROMIUM_EXECUTABLE to use a specific browser"
      );
    }
    const profileDirectory = this.#profileDirectory(ownerId);
    const freshProfile = !(await this.#profileExists(ownerId));
    const browser = await ChromiumBrowser.launch({
      executable: this.#executable,
      profileDirectory,
    });
    const journal = parseJournal(
      await readFile(this.#journalPath(ownerId), "utf8").catch(() => "")
    );
    for (const url of journal?.urls ?? []) {
      // biome-ignore lint/performance/noAwaitInLoops: Tabs are restored in their journaled order.
      await browser.createTab(url).catch(() => undefined);
    }
    if (freshProfile && ownerId !== canonicalOwnerId) {
      await this.#seedFromCanonical(browser);
    }
    return browser;
  }

  #journalPath(ownerId: string) {
    return join(this.#paths.journalDirectory, `${ownerId}.json`);
  }

  #profileDirectory(ownerId: string) {
    return join(this.#paths.profilesDirectory, ownerId);
  }

  async #profileExists(ownerId: string) {
    try {
      await readFile(
        join(this.#profileDirectory(ownerId), "Local State"),
        "utf8"
      );
      return true;
    } catch {
      return false;
    }
  }

  async #seedFromCanonical(browser: ChromiumBrowser) {
    try {
      const canonical = await this.browserFor(canonicalOwnerId);
      const cookies = await canonical.exportCookies();
      if (cookies.length > 0) {
        await browser.importCookies(cookies);
      }
    } catch {
      // A session browser without seeded logins is degraded, not broken.
    }
  }
}
