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
  readonly agentBrowserDirectory: string;
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
    agentBrowserDirectory: join(dataDirectory, "agent-browser"),
    dataDirectory,
    journalDirectory: join(dataDirectory, "targets"),
    profilesDirectory: join(dataDirectory, "profiles"),
  };
};

export const agentBrowserConfigPath = (
  ownerId: string = canonicalOwnerId,
  paths: BrowserSupervisorPaths = browserSupervisorPaths()
) => join(paths.agentBrowserDirectory, `${ownerId}.json`);

const cdpHttpEndpoint = (webSocketUrl: string) => {
  const url = new URL(webSocketUrl);
  return `http://${url.hostname}:${url.port}`;
};

export const renderAgentBrowserConfig = (
  ownerId: string,
  cdpUrl: string,
  paths: BrowserSupervisorPaths
) =>
  `${JSON.stringify(
    {
      $schema: "https://agent-browser.dev/schema.json",
      cdp: cdpUrl,
      contentBoundaries: true,
      downloadPath: join(paths.dataDirectory, "downloads", ownerId),
      maxOutput: 30_000,
      namespace: "vibepad",
      screenshotDir: join(paths.dataDirectory, "screenshots", ownerId),
      session: ownerId === canonicalOwnerId ? "vibepad-live" : ownerId,
    },
    null,
    2
  )}\n`;

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
  readonly #restored = new Map<string, readonly string[]>();

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

  get paths() {
    return this.#paths;
  }

  async findExecutable() {
    this.#executable ??= await this.#executableFinder();
    return this.#executable;
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

  runningBrowser(ownerId: string) {
    return this.#browsers.get(ownerId);
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

  /**
   * Target ids restored from the owner's journal at launch, in restore order.
   * CDP target enumeration order is not deterministic, so consumers that
   * present tabs in creation order seed their ordering from this list.
   */
  restoredTargets(ownerId: string): readonly string[] {
    return this.#restored.get(ownerId) ?? [];
  }

  runningOwners() {
    return [...this.#browsers.keys()];
  }

  async snapshotTargets(ownerId: string, targetIdOrder?: readonly string[]) {
    const browser = this.#browsers.get(ownerId);
    if (!browser) {
      return;
    }
    try {
      const targets = (await browser.listTargets()).filter(
        (target) =>
          target.type === "page" && restorableUrlPattern.test(target.url)
      );
      if (targetIdOrder) {
        const position = new Map(
          targetIdOrder.map((targetId, index) => [targetId, index])
        );
        targets.sort(
          (a, b) =>
            (position.get(a.targetId) ?? Number.MAX_SAFE_INTEGER) -
            (position.get(b.targetId) ?? Number.MAX_SAFE_INTEGER)
        );
      }
      const urls = [...new Set(targets.map((target) => target.url))];
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
    this.#restored.delete(ownerId);
    await browser.close();
  }

  async stopAll() {
    const owners = this.runningOwners();
    await Promise.all(owners.map((ownerId) => this.stop(ownerId)));
  }

  async #launch(ownerId: string): Promise<ChromiumBrowser> {
    const executable = await this.findExecutable();
    if (!executable) {
      throw new Error(
        "VibePad needs Google Chrome or Chromium installed on this computer; set VIBEPAD_CHROMIUM_EXECUTABLE to use a specific browser"
      );
    }
    const profileDirectory = this.#profileDirectory(ownerId);
    const freshProfile = !(await this.#profileExists(ownerId));
    const browser = await ChromiumBrowser.launch({
      executable,
      profileDirectory,
    });
    const journal = parseJournal(
      await readFile(this.#journalPath(ownerId), "utf8").catch(() => "")
    );
    const restored: string[] = [];
    for (const url of journal?.urls ?? []) {
      // biome-ignore lint/performance/noAwaitInLoops: Tabs are restored in their journaled order.
      const tab = await browser.createTab(url).catch(() => undefined);
      if (tab) {
        restored.push(tab.targetId);
      }
    }
    this.#restored.set(ownerId, restored);
    if (freshProfile && ownerId !== canonicalOwnerId) {
      await this.#seedFromCanonical(browser);
    }
    await this.#writeAgentBrowserConfig(ownerId, browser);
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

  async #writeAgentBrowserConfig(ownerId: string, browser: ChromiumBrowser) {
    try {
      const configPath = agentBrowserConfigPath(ownerId, this.#paths);
      await Promise.all([
        mkdir(this.#paths.agentBrowserDirectory, {
          mode: 0o700,
          recursive: true,
        }),
        mkdir(join(this.#paths.dataDirectory, "downloads", ownerId), {
          mode: 0o700,
          recursive: true,
        }),
        mkdir(join(this.#paths.dataDirectory, "screenshots", ownerId), {
          mode: 0o700,
          recursive: true,
        }),
      ]);
      await writeFile(
        configPath,
        renderAgentBrowserConfig(
          ownerId,
          cdpHttpEndpoint(browser.webSocketUrl),
          this.#paths
        ),
        { mode: 0o600 }
      );
    } catch {
      // Agent Browser configuration is advisory; the browser stays usable.
    }
  }
}
