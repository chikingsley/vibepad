import { type ChildProcess, spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdir } from "node:fs/promises";

export interface ChromiumScreencastMetadata {
  readonly deviceHeight: number;
  readonly deviceWidth: number;
  readonly offsetTop: number;
  readonly pageScaleFactor: number;
  readonly scrollOffsetX: number;
  readonly scrollOffsetY: number;
  readonly timestamp?: number;
}

export interface ChromiumScreencastFrame {
  readonly data: string;
  readonly metadata: ChromiumScreencastMetadata;
}

export interface ChromiumTab {
  readonly sessionId: string;
  readonly targetId: string;
}

interface CdpEvent {
  readonly method: string;
  readonly params: Record<string, unknown>;
  readonly sessionId?: string;
}

const devToolsUrlPattern = /DevTools listening on (ws:\/\/\S+)/u;
const launchTimeoutMilliseconds = 15_000;
const commandTimeoutMilliseconds = 10_000;

export const chromiumExecutableCandidates = (platform = process.platform) =>
  platform === "darwin"
    ? [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
      ]
    : [
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser",
        "/usr/bin/google-chrome",
        "/usr/bin/google-chrome-stable",
      ];

export const findChromiumExecutable = async (
  environment: NodeJS.ProcessEnv = process.env,
  candidates: readonly string[] = chromiumExecutableCandidates()
) => {
  // biome-ignore lint/complexity/useLiteralKeys: strict index-signature access is required by the shared TypeScript config.
  const configured = environment["VIBEPAD_CHROMIUM_EXECUTABLE"];
  const paths = configured ? [configured, ...candidates] : candidates;
  for (const path of paths) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: Candidates are checked in priority order.
      await access(path, constants.X_OK);
      return path;
    } catch {
      // An absent candidate is expected; the next one is tried.
    }
  }
};

const withTimeout = <T>(
  promise: Promise<T>,
  milliseconds: number,
  label: string
) =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${milliseconds}ms`));
    }, milliseconds);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });

export class ChromiumBrowser {
  readonly #eventHandlers = new Map<string, Set<(event: CdpEvent) => void>>();
  #nextCommandId = 1;
  readonly #pending = new Map<
    number,
    {
      readonly reject: (error: Error) => void;
      readonly resolve: (result: Record<string, unknown>) => void;
    }
  >();
  readonly #process: ChildProcess;
  readonly #socket: WebSocket;
  readonly #webSocketUrl: string;

  private constructor(
    child: ChildProcess,
    socket: WebSocket,
    webSocketUrl: string
  ) {
    this.#process = child;
    this.#socket = socket;
    this.#webSocketUrl = webSocketUrl;
    socket.addEventListener("message", (event) => {
      this.#receive(String(event.data));
    });
  }

  static async launch(options: {
    readonly executable: string;
    readonly extraArgs?: readonly string[];
    readonly profileDirectory: string;
  }): Promise<ChromiumBrowser> {
    await mkdir(options.profileDirectory, { mode: 0o700, recursive: true });
    const child = spawn(
      options.executable,
      [
        "--headless=new",
        "--remote-debugging-port=0",
        `--user-data-dir=${options.profileDirectory}`,
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-background-networking",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        ...(options.extraArgs ?? []),
        "about:blank",
      ],
      { stdio: ["ignore", "ignore", "pipe"] }
    );
    const webSocketUrl = await withTimeout(
      new Promise<string>((resolve, reject) => {
        let stderrTail = "";
        child.stderr?.on("data", (chunk: Buffer) => {
          stderrTail = `${stderrTail}${chunk.toString()}`.slice(-8192);
          const match = stderrTail.match(devToolsUrlPattern);
          if (match?.[1]) {
            resolve(match[1]);
          }
        });
        child.once("exit", (code) => {
          reject(
            new Error(
              `Chromium exited with code ${code} before DevTools was ready: ${stderrTail.trim()}`
            )
          );
        });
        child.once("error", reject);
      }),
      launchTimeoutMilliseconds,
      "Chromium launch"
    );
    const socket = new WebSocket(webSocketUrl);
    await withTimeout(
      new Promise<void>((resolve, reject) => {
        socket.addEventListener("open", () => resolve(), { once: true });
        socket.addEventListener(
          "error",
          () => reject(new Error("Chromium DevTools socket failed to open")),
          { once: true }
        );
      }),
      launchTimeoutMilliseconds,
      "DevTools socket"
    );
    return new ChromiumBrowser(child, socket, webSocketUrl);
  }

  get webSocketUrl() {
    return this.#webSocketUrl;
  }

  async close() {
    try {
      await withTimeout(this.send("Browser.close"), 2000, "Browser.close");
    } catch {
      this.#process.kill("SIGKILL");
    }
    await new Promise<void>((resolve) => {
      if (this.#process.exitCode !== null) {
        resolve();
        return;
      }
      this.#process.once("exit", () => resolve());
      setTimeout(() => {
        this.#process.kill("SIGKILL");
        resolve();
      }, 3000).unref();
    });
  }

  async createTab(url: string): Promise<ChromiumTab> {
    const created = await this.send<{ targetId: string }>(
      "Target.createTarget",
      { url }
    );
    const attached = await this.send<{ sessionId: string }>(
      "Target.attachToTarget",
      { flatten: true, targetId: created.targetId }
    );
    await this.send("Page.enable", {}, attached.sessionId);
    return { sessionId: attached.sessionId, targetId: created.targetId };
  }

  async exportCookies() {
    const exported = await this.send<{ cookies: Record<string, unknown>[] }>(
      "Storage.getCookies"
    );
    return exported.cookies;
  }

  async importCookies(cookies: readonly Record<string, unknown>[]) {
    await this.send("Storage.setCookies", { cookies });
  }

  async evaluate(sessionId: string, expression: string) {
    const evaluated = await this.send<{ result?: { value?: unknown } }>(
      "Runtime.evaluate",
      { awaitPromise: true, expression, returnByValue: true },
      sessionId
    );
    return evaluated.result?.value;
  }

  async listTargets() {
    const listed = await this.send<{
      targetInfos: {
        targetId: string;
        title: string;
        type: string;
        url: string;
      }[];
    }>("Target.getTargets");
    return listed.targetInfos;
  }

  onEvent(method: string, handler: (event: CdpEvent) => void) {
    const handlers = this.#eventHandlers.get(method) ?? new Set();
    handlers.add(handler);
    this.#eventHandlers.set(method, handlers);
    return () => {
      handlers.delete(handler);
    };
  }

  send<T = Record<string, unknown>>(
    method: string,
    params: Record<string, unknown> = {},
    sessionId?: string
  ): Promise<T> {
    const id = this.#nextCommandId;
    this.#nextCommandId += 1;
    const command = withTimeout(
      new Promise<Record<string, unknown>>((resolve, reject) => {
        this.#pending.set(id, { reject, resolve });
      }),
      commandTimeoutMilliseconds,
      method
    );
    this.#socket.send(
      JSON.stringify(
        sessionId ? { id, method, params, sessionId } : { id, method, params }
      )
    );
    return command as Promise<T>;
  }

  async startScreencast(
    sessionId: string,
    onFrame: (frame: ChromiumScreencastFrame) => void,
    options: {
      readonly maxHeight?: number;
      readonly maxWidth?: number;
      readonly quality?: number;
    } = {}
  ) {
    const stop = this.onEvent("Page.screencastFrame", (event) => {
      if (event.sessionId !== sessionId) {
        return;
      }
      const frame = event.params as unknown as {
        readonly data: string;
        readonly metadata: ChromiumScreencastMetadata;
        readonly sessionId: number;
      };
      this.send(
        "Page.screencastFrameAck",
        { sessionId: frame.sessionId },
        sessionId
      ).catch(() => undefined);
      onFrame({ data: frame.data, metadata: frame.metadata });
    });
    await this.send(
      "Page.startScreencast",
      {
        everyNthFrame: 1,
        format: "jpeg",
        maxHeight: options.maxHeight ?? 1080,
        maxWidth: options.maxWidth ?? 1440,
        quality: options.quality ?? 60,
      },
      sessionId
    );
    return async () => {
      stop();
      await this.send("Page.stopScreencast", {}, sessionId).catch(
        () => undefined
      );
    };
  }

  #receive(raw: string) {
    let message: {
      error?: { message?: string };
      id?: number;
      method?: string;
      params?: Record<string, unknown>;
      result?: Record<string, unknown>;
      sessionId?: string;
    };
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    if (typeof message.id === "number") {
      const pending = this.#pending.get(message.id);
      if (!pending) {
        return;
      }
      this.#pending.delete(message.id);
      if (message.error) {
        pending.reject(
          new Error(message.error.message ?? "Chromium DevTools command failed")
        );
        return;
      }
      pending.resolve(message.result ?? {});
      return;
    }
    if (message.method) {
      const handlers = this.#eventHandlers.get(message.method);
      if (!handlers) {
        return;
      }
      const event: CdpEvent = {
        method: message.method,
        params: message.params ?? {},
        ...(message.sessionId ? { sessionId: message.sessionId } : {}),
      };
      for (const handler of handlers) {
        handler(event);
      }
    }
  }
}
