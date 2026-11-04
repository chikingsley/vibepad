import { createHash, randomBytes } from "node:crypto";
import {
  type BrowserState,
  type BrowserTarget,
  type BrowserTargetActionRequest,
  type BrowserViewSession,
  browserPath,
  browserTargetActionRequestSchema,
  browserTargetsPath,
  browserViewPathPrefix,
  browserViewSessionsPath,
  createBrowserTargetRequestSchema,
} from "@vibepad/protocol/browser";
import { z } from "zod";

import { canonicalOwnerId } from "./browser-supervisor";
import { renderBrowserViewPage } from "./browser-view-page";
import type { ChromiumScreencastFrame } from "./chromium-browser";
import type { HostAuthPrincipal } from "./host-auth-contract";

const browserViewAssetPathPattern =
  /^\/v1\/browser\/view\/(?<token>[^/]+)\/(?<asset>.+)$/u;
const browserSocketPathPattern = /^\/v1\/browser\/socket\/(?<token>[^/]+)$/u;
const viewSessionTtlMs = 10 * 60 * 1000;
const maxScreencastDimension = 4096;
const screencastQuality = 60;

/** The slice of a supervised Chromium the broker drives over CDP. */
export interface BrokeredBrowser {
  createTab: (url: string) => Promise<{ sessionId: string; targetId: string }>;
  listTargets: () => Promise<
    readonly {
      targetId: string;
      title: string;
      type: string;
      url: string;
    }[]
  >;
  send: <T = Record<string, unknown>>(
    method: string,
    params?: Record<string, unknown>,
    sessionId?: string
  ) => Promise<T>;
  startScreencast: (
    sessionId: string,
    onFrame: (frame: ChromiumScreencastFrame) => void,
    options?: {
      readonly maxHeight?: number;
      readonly maxWidth?: number;
      readonly quality?: number;
    }
  ) => Promise<() => Promise<void>>;
}

/** The slice of the BrowserSupervisor the broker depends on. */
export interface BrokeredSupervisor {
  browserFor: (ownerId: string) => Promise<BrokeredBrowser>;
  findExecutable: () => Promise<string | undefined>;
  restoredTargets: (ownerId: string) => readonly string[];
  snapshotTargets: (
    ownerId: string,
    targetIdOrder?: readonly string[]
  ) => Promise<void>;
}

export interface BrowserViewClient {
  close: (code?: number, reason?: string) => void;
  send: (data: string) => void;
}

export interface BrowserViewConnectionHandle {
  closed: () => void;
  message: (raw: string) => void;
}

export type BrowserServiceErrorCode =
  | "browser_not_available"
  | "browser_target_not_found"
  | "browser_upstream_unavailable"
  | "browser_view_unauthorized";

export class BrowserServiceError extends Error {
  readonly code: BrowserServiceErrorCode;
  readonly status: number;

  constructor(
    code: BrowserServiceErrorCode,
    message: string,
    status: number,
    options?: { readonly cause?: unknown }
  ) {
    super(message, options);
    this.name = "BrowserServiceError";
    this.code = code;
    this.status = status;
  }
}

export interface BrowserServiceConfig {
  readonly enabled: boolean;
  readonly now?: () => number;
  readonly supervisor: BrokeredSupervisor;
  readonly viewSessionTtl?: number;
}

interface ViewSessionRecord {
  readonly deviceId: string;
  readonly expiresAt: number;
}

interface PageTargetInfo {
  readonly targetId: string;
  readonly title: string;
  readonly url: string;
}

interface NavigationHistory {
  readonly currentIndex: number;
  readonly entries: readonly { readonly id: number }[];
}

const coordinateSchema = z.number().min(-32_768).max(32_768);
const modifiersSchema = z.number().int().min(0).max(15).default(0);

const mouseInputSchema = z
  .object({
    button: z.enum(["left", "middle", "none", "right"]),
    clickCount: z.number().int().min(0).max(8).default(0),
    kind: z.literal("mouse"),
    modifiers: modifiersSchema,
    type: z.enum(["mousePressed", "mouseReleased", "mouseMoved"]),
    x: coordinateSchema,
    y: coordinateSchema,
  })
  .strict();

const wheelInputSchema = z
  .object({
    deltaX: z.number().min(-4096).max(4096),
    deltaY: z.number().min(-4096).max(4096),
    kind: z.literal("wheel"),
    modifiers: modifiersSchema,
    x: coordinateSchema,
    y: coordinateSchema,
  })
  .strict();

const touchPointSchema = z
  .object({
    force: z.number().min(0).max(1).optional(),
    id: z.number().int().min(0).max(32).default(0),
    x: coordinateSchema,
    y: coordinateSchema,
  })
  .strict();

const touchInputSchema = z
  .object({
    kind: z.literal("touch"),
    modifiers: modifiersSchema,
    touchPoints: z.array(touchPointSchema).max(10),
    type: z.enum(["touchStart", "touchMove", "touchEnd", "touchCancel"]),
  })
  .strict();

const keyInputSchema = z
  .object({
    code: z.string().max(64),
    key: z.string().max(64),
    kind: z.literal("key"),
    modifiers: modifiersSchema,
    text: z.string().max(16).default(""),
    type: z.enum(["keyDown", "keyUp", "char"]),
  })
  .strict();

const viewInputSchema = z.discriminatedUnion("kind", [
  keyInputSchema,
  mouseInputSchema,
  touchInputSchema,
  wheelInputSchema,
]);

type ViewInput = z.infer<typeof viewInputSchema>;

const viewClientMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ack") }).strict(),
  z
    .object({
      deviceScaleFactor: z.number().min(0.25).max(4).default(1),
      height: z.number().min(1).max(8192),
      type: z.literal("viewport"),
      width: z.number().min(1).max(8192),
    })
    .strict(),
  z.object({ input: viewInputSchema, type: z.literal("input") }).strict(),
]);

interface ViewViewport {
  readonly deviceScaleFactor: number;
  readonly height: number;
  readonly width: number;
}

const namedVirtualKeyCodes: Record<string, number> = {
  " ": 32,
  Alt: 18,
  ArrowDown: 40,
  ArrowLeft: 37,
  ArrowRight: 39,
  ArrowUp: 38,
  Backspace: 8,
  Control: 17,
  Delete: 46,
  End: 35,
  Enter: 13,
  Escape: 27,
  Home: 36,
  Meta: 91,
  PageDown: 34,
  PageUp: 33,
  Shift: 16,
  Tab: 9,
};

const singleCharacterPattern = /^[\p{L}\p{N}]$/u;

const virtualKeyCode = (key: string) => {
  const named = namedVirtualKeyCodes[key];
  if (named !== undefined) {
    return named;
  }
  if (singleCharacterPattern.test(key)) {
    return key.toUpperCase().charCodeAt(0);
  }
  return 0;
};

const keyEventParams = (input: z.infer<typeof keyInputSchema>) => {
  const text = input.key === "Enter" ? "\r" : input.text;
  const code = virtualKeyCode(input.key);
  return {
    code: input.code,
    key: input.key,
    modifiers: input.modifiers,
    type: input.type,
    ...(text ? { text, unmodifiedText: text } : {}),
    ...(code
      ? { nativeVirtualKeyCode: code, windowsVirtualKeyCode: code }
      : {}),
  };
};

const inputCommand = (
  input: ViewInput
): { readonly method: string; readonly params: Record<string, unknown> } => {
  if (input.kind === "mouse") {
    return {
      method: "Input.dispatchMouseEvent",
      params: {
        button: input.button,
        clickCount: input.clickCount,
        modifiers: input.modifiers,
        type: input.type,
        x: input.x,
        y: input.y,
      },
    };
  }
  if (input.kind === "wheel") {
    return {
      method: "Input.dispatchMouseEvent",
      params: {
        deltaX: input.deltaX,
        deltaY: input.deltaY,
        modifiers: input.modifiers,
        type: "mouseWheel",
        x: input.x,
        y: input.y,
      },
    };
  }
  if (input.kind === "touch") {
    return {
      method: "Input.dispatchTouchEvent",
      params: {
        modifiers: input.modifiers,
        touchPoints: input.touchPoints,
        type: input.type,
      },
    };
  }
  return { method: "Input.dispatchKeyEvent", params: keyEventParams(input) };
};

interface ViewAttachment {
  readonly browser: BrokeredBrowser;
  readonly sessionId: string;
  readonly targetId: string;
}

interface ViewConnectionOptions {
  readonly attach: () => Promise<ViewAttachment>;
  readonly client: BrowserViewClient;
  readonly deviceId: string;
  readonly release: (connection: ViewConnection) => void;
  readonly ttlMs: number;
}

class ViewConnection implements BrowserViewConnectionHandle {
  readonly deviceId: string;
  #attachment: ViewAttachment | undefined;
  readonly #attach: () => Promise<ViewAttachment>;
  readonly #client: BrowserViewClient;
  #closed: boolean;
  readonly #expiryTimer: ReturnType<typeof setTimeout>;
  #pendingFrame: ChromiumScreencastFrame | undefined;
  #readyForFrame: boolean;
  readonly #release: (connection: ViewConnection) => void;
  #stopScreencast: (() => Promise<void>) | undefined;
  #viewport: ViewViewport | undefined;
  #work: Promise<void> = Promise.resolve();

  constructor(options: ViewConnectionOptions) {
    this.deviceId = options.deviceId;
    this.#attach = options.attach;
    this.#client = options.client;
    this.#closed = false;
    this.#readyForFrame = true;
    this.#release = options.release;
    this.#expiryTimer = setTimeout(() => {
      this.expire("Browser view session expired");
    }, options.ttlMs);
  }

  get viewedTargetId() {
    return this.#attachment?.targetId;
  }

  closed() {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    clearTimeout(this.#expiryTimer);
    this.#release(this);
    const stop = this.#stopScreencast;
    this.#stopScreencast = undefined;
    stop?.().catch(() => undefined);
  }

  expire(reason: string) {
    if (this.#closed) {
      return;
    }
    this.#client.close(1000, reason);
    this.closed();
  }

  message(raw: string) {
    if (this.#closed) {
      return;
    }
    let parsed: z.infer<typeof viewClientMessageSchema>;
    try {
      parsed = viewClientMessageSchema.parse(JSON.parse(raw));
    } catch {
      this.#client.close(1008, "Invalid browser view message");
      this.closed();
      return;
    }
    if (parsed.type === "ack") {
      this.#acknowledgeFrame();
      return;
    }
    if (parsed.type === "viewport") {
      const viewport: ViewViewport = {
        deviceScaleFactor: parsed.deviceScaleFactor,
        height: Math.round(parsed.height),
        width: Math.round(parsed.width),
      };
      this.#viewport = viewport;
      this.#enqueue(() => this.#applyViewport(viewport));
      return;
    }
    this.#dispatchInput(parsed.input);
  }

  /** Re-attach the screencast after the active browser target changed. */
  retarget() {
    const viewport = this.#viewport;
    if (!viewport) {
      return;
    }
    this.#enqueue(() => this.#applyViewport(viewport));
  }

  #acknowledgeFrame() {
    const pending = this.#pendingFrame;
    if (pending) {
      this.#pendingFrame = undefined;
      this.#sendFrame(pending);
      return;
    }
    this.#readyForFrame = true;
  }

  async #applyViewport(viewport: ViewViewport) {
    const attachment = await this.#attach();
    if (this.#closed) {
      return;
    }
    this.#attachment = attachment;
    await attachment.browser.send(
      "Emulation.setDeviceMetricsOverride",
      {
        deviceScaleFactor: viewport.deviceScaleFactor,
        height: viewport.height,
        mobile: false,
        width: viewport.width,
      },
      attachment.sessionId
    );
    const previousStop = this.#stopScreencast;
    this.#stopScreencast = undefined;
    await previousStop?.().catch(() => undefined);
    if (this.#closed) {
      return;
    }
    const clamp = (value: number) =>
      Math.min(
        maxScreencastDimension,
        Math.max(1, Math.round(value * viewport.deviceScaleFactor))
      );
    this.#stopScreencast = await attachment.browser.startScreencast(
      attachment.sessionId,
      (frame) => {
        this.#handleFrame(frame);
      },
      {
        maxHeight: clamp(viewport.height),
        maxWidth: clamp(viewport.width),
        quality: screencastQuality,
      }
    );
  }

  #dispatchInput(input: ViewInput) {
    const attachment = this.#attachment;
    if (!attachment) {
      return;
    }
    const { method, params } = inputCommand(input);
    attachment.browser.send(method, params, attachment.sessionId).catch(() => {
      this.#fail("Browser input dispatch failed");
    });
  }

  #enqueue(work: () => Promise<void>) {
    this.#work = this.#work.then(work).catch(() => {
      this.#fail("VibePad Browser is unavailable");
    });
  }

  #fail(reason: string) {
    if (this.#closed) {
      return;
    }
    this.#client.close(1011, reason);
    this.closed();
  }

  #handleFrame(frame: ChromiumScreencastFrame) {
    if (this.#closed) {
      return;
    }
    if (this.#readyForFrame) {
      this.#readyForFrame = false;
      this.#sendFrame(frame);
      return;
    }
    this.#pendingFrame = frame;
  }

  #sendFrame(frame: ChromiumScreencastFrame) {
    try {
      this.#client.send(
        JSON.stringify({
          data: frame.data,
          metadata: frame.metadata,
          type: "frame",
        })
      );
    } catch {
      this.#fail("Browser view send failed");
    }
  }
}

const digest = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");

const json = (value: unknown, status = 200) => Response.json(value, { status });

const targetRoute = (pathname: string) => {
  const [, version, browser, targets, encodedTargetId, action, ...remainder] =
    pathname.split("/");
  if (
    version !== "v1" ||
    browser !== "browser" ||
    targets !== "targets" ||
    !encodedTargetId ||
    remainder.length > 0 ||
    (action !== undefined && action !== "actions")
  ) {
    return;
  }
  return {
    action: action === "actions",
    targetId: decodeURIComponent(encodedTargetId),
  };
};

const targetError = (targetId: string, cause?: unknown) =>
  new BrowserServiceError(
    "browser_target_not_found",
    `Browser target ${targetId} was not found`,
    404,
    cause === undefined ? undefined : { cause }
  );

const upstreamError = (detail: string, cause?: unknown) =>
  new BrowserServiceError(
    "browser_upstream_unavailable",
    `VibePad Browser ${detail}`,
    503,
    cause === undefined ? undefined : { cause }
  );

const sessionCommand = async <T = Record<string, unknown>>(
  browser: BrokeredBrowser,
  sessionId: string,
  method: string,
  params: Record<string, unknown> = {}
): Promise<T> => {
  try {
    return await browser.send<T>(method, params, sessionId);
  } catch (error) {
    throw upstreamError(
      error instanceof Error ? error.message : `${method} failed`,
      error
    );
  }
};

export class BrowserService {
  #activeTargetId: string | undefined;
  #browserRef: BrokeredBrowser | undefined;
  readonly #enabled: boolean;
  readonly #now: () => number;
  #orderSeeded: boolean;
  readonly #sessions = new Map<string, string>();
  readonly #supervisor: BrokeredSupervisor;
  #targetOrder: string[] = [];
  readonly #views = new Set<ViewConnection>();
  readonly #viewSessions = new Map<string, ViewSessionRecord>();
  readonly #viewSessionTtl: number;

  constructor(config: BrowserServiceConfig) {
    this.#enabled = config.enabled;
    this.#now = config.now ?? Date.now;
    this.#orderSeeded = false;
    this.#supervisor = config.supervisor;
    this.#viewSessionTtl = config.viewSessionTtl ?? viewSessionTtlMs;
  }

  // biome-ignore lint/style/useThisInClassMethods: Callers reach routing through the injected service instance.
  isSocketRequest(pathname: string) {
    return browserSocketPathPattern.test(pathname);
  }

  // biome-ignore lint/style/useThisInClassMethods: Callers reach routing through the injected service instance.
  isViewAssetRequest(pathname: string) {
    return browserViewAssetPathPattern.test(pathname);
  }

  authorizeSocket(pathname: string) {
    const token = browserSocketPathPattern.exec(pathname)?.[1];
    return Boolean(token && this.#validViewToken(token));
  }

  /**
   * Opens a live view over an upgraded WebSocket. Returns undefined when the
   * path does not carry a valid, unexpired view lease.
   */
  connectView(
    pathname: string,
    client: BrowserViewClient
  ): BrowserViewConnectionHandle | undefined {
    const token = browserSocketPathPattern.exec(pathname)?.[1];
    if (!(token && this.#validViewToken(token))) {
      return;
    }
    const record = this.#viewSessions.get(digest(token));
    if (!record) {
      return;
    }
    const connection = new ViewConnection({
      attach: () => this.#attachActiveTarget(),
      client,
      deviceId: record.deviceId,
      release: (released) => {
        this.#views.delete(released);
      },
      ttlMs: Math.max(1, record.expiresAt - this.#now()),
    });
    this.#views.add(connection);
    return connection;
  }

  handleViewAsset(request: Request, url: URL): Response {
    if (request.method !== "GET") {
      return json({ error: "method_not_allowed" }, 405);
    }
    const match = browserViewAssetPathPattern.exec(url.pathname);
    const token = match?.[1];
    const assetPath = match?.[2];
    if (!(token && this.#validViewToken(token))) {
      throw new BrowserServiceError(
        "browser_view_unauthorized",
        "The browser view session is invalid or expired",
        401
      );
    }
    if (assetPath !== "index.html") {
      return json({ error: "not_found" }, 404);
    }
    return new Response(renderBrowserViewPage(), {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/html; charset=utf-8",
      },
    });
  }

  async handleAuthorizedHttp(
    request: Request,
    url: URL,
    principal?: HostAuthPrincipal
  ): Promise<Response | undefined> {
    if (request.method === "GET" && url.pathname === browserPath) {
      return json({ data: await this.state() });
    }
    if (request.method === "POST" && url.pathname === browserViewSessionsPath) {
      return json({ data: await this.createViewSession(principal) }, 201);
    }
    if (request.method === "POST" && url.pathname === browserTargetsPath) {
      const input = createBrowserTargetRequestSchema.parse(
        await request.json()
      );
      return json({ data: await this.createTarget(input.url) }, 201);
    }
    const route = targetRoute(url.pathname);
    if (request.method === "DELETE" && route && !route.action) {
      await this.closeTarget(route.targetId);
      return json({ closed: true });
    }
    if (request.method === "POST" && route?.action) {
      const action = browserTargetActionRequestSchema.parse(
        await request.json()
      );
      await this.performAction(route.targetId, action);
      return json({ accepted: true }, 202);
    }
  }

  async state(): Promise<BrowserState> {
    if (!(this.#enabled && (await this.#supervisor.findExecutable()))) {
      return {
        available: false,
        canGoBack: false,
        canGoForward: false,
        healthy: false,
        targets: [],
      };
    }
    try {
      const browser = await this.#browser();
      const targets = await this.#inventory(browser);
      const activeTargetId = this.#resolveActiveTarget(targets);
      const navigation = activeTargetId
        ? await this.#navigationState(browser, activeTargetId)
        : { canGoBack: false, canGoForward: false };
      return {
        ...(activeTargetId ? { activeTargetId } : {}),
        available: true,
        ...navigation,
        healthy: true,
        targets: targets.map((target) => ({
          id: target.targetId,
          title: target.title,
          url: target.url,
        })),
      };
    } catch {
      return {
        available: true,
        canGoBack: false,
        canGoForward: false,
        healthy: false,
        targets: [],
      };
    }
  }

  async createViewSession(
    principal?: HostAuthPrincipal
  ): Promise<BrowserViewSession> {
    await this.#requireAvailable();
    this.#pruneViewSessions();
    const token = randomBytes(32).toString("base64url");
    const expiresAt = this.#now() + this.#viewSessionTtl;
    this.#viewSessions.set(digest(token), {
      deviceId: principal?.deviceId ?? "local",
      expiresAt,
    });
    return {
      expiresAt: new Date(expiresAt).toISOString(),
      path: `${browserViewPathPrefix}/${token}/index.html`,
    };
  }

  revokeDevice(deviceId: string): void {
    for (const [token, session] of this.#viewSessions) {
      if (session.deviceId === deviceId) {
        this.#viewSessions.delete(token);
      }
    }
    for (const view of [...this.#views]) {
      if (view.deviceId === deviceId) {
        view.expire("This device was revoked");
      }
    }
  }

  async createTarget(url: string): Promise<BrowserTarget> {
    const browser = await this.#requireBrowser();
    await this.#inventory(browser);
    let tab: { sessionId: string; targetId: string };
    try {
      tab = await browser.createTab(url);
    } catch (error) {
      throw upstreamError(`could not open ${url}`, error);
    }
    this.#sessions.set(tab.targetId, tab.sessionId);
    this.#targetOrder = [
      ...this.#targetOrder.filter((targetId) => targetId !== tab.targetId),
      tab.targetId,
    ];
    this.#activeTargetId = tab.targetId;
    this.#retargetViews();
    await this.#snapshot();
    const info = await browser
      .send<{
        targetInfo: { title: string; url: string };
      }>("Target.getTargetInfo", { targetId: tab.targetId })
      .catch(() => undefined);
    return {
      id: tab.targetId,
      title: info?.targetInfo.title ?? "",
      url: info?.targetInfo.url ?? url,
    };
  }

  async closeTarget(targetId: string): Promise<void> {
    const browser = await this.#requireBrowser();
    const targets = await this.#inventory(browser);
    if (!targets.some((target) => target.targetId === targetId)) {
      throw targetError(targetId);
    }
    if (targets.length === 1) {
      // The surface always retains one target so the view stays attachable.
      const replacement = await browser
        .createTab("about:blank")
        .catch((error: unknown) => {
          throw upstreamError("could not retain a blank browser target", error);
        });
      this.#sessions.set(replacement.targetId, replacement.sessionId);
      this.#targetOrder.push(replacement.targetId);
    }
    try {
      await browser.send("Target.closeTarget", { targetId });
    } catch (error) {
      throw targetError(targetId, error);
    }
    this.#sessions.delete(targetId);
    this.#targetOrder = this.#targetOrder.filter(
      (orderedTargetId) => orderedTargetId !== targetId
    );
    if (this.#activeTargetId === targetId) {
      this.#activeTargetId = this.#targetOrder[0];
      this.#retargetViews();
    }
    await this.#snapshot();
  }

  async performAction(
    targetId: string,
    action: BrowserTargetActionRequest
  ): Promise<void> {
    const browser = await this.#requireBrowser();
    const targets = await this.#inventory(browser);
    if (!targets.some((target) => target.targetId === targetId)) {
      throw targetError(targetId);
    }
    if (action.action === "activate") {
      await browser
        .send("Target.activateTarget", { targetId })
        .catch(() => undefined);
      this.#activeTargetId = targetId;
      this.#retargetViews();
      return;
    }
    const sessionId = await this.#sessionFor(browser, targetId);
    if (action.action === "navigate") {
      await sessionCommand(browser, sessionId, "Page.navigate", {
        url: action.url,
      });
      return;
    }
    if (action.action === "reload") {
      await sessionCommand(browser, sessionId, "Page.reload");
      return;
    }
    const history = await sessionCommand<NavigationHistory>(
      browser,
      sessionId,
      "Page.getNavigationHistory"
    );
    const nextIndex =
      action.action === "back"
        ? history.currentIndex - 1
        : history.currentIndex + 1;
    const entry = history.entries[nextIndex];
    if (!entry) {
      return;
    }
    await sessionCommand(browser, sessionId, "Page.navigateToHistoryEntry", {
      entryId: entry.id,
    });
  }

  async #attachActiveTarget(): Promise<ViewAttachment> {
    const browser = await this.#requireBrowser();
    const targets = await this.#inventory(browser);
    const targetId = this.#resolveActiveTarget(targets);
    if (!targetId) {
      throw upstreamError("has no viewable browser target");
    }
    const sessionId = await this.#sessionFor(browser, targetId);
    return { browser, sessionId, targetId };
  }

  async #browser(): Promise<BrokeredBrowser> {
    const browser = await this.#supervisor.browserFor(canonicalOwnerId);
    if (this.#browserRef !== browser) {
      // A relaunched browser invalidates sessions and the in-memory order.
      this.#browserRef = browser;
      this.#sessions.clear();
      this.#targetOrder = [];
      this.#orderSeeded = false;
      this.#activeTargetId = undefined;
    }
    return browser;
  }

  async #inventory(browser: BrokeredBrowser): Promise<PageTargetInfo[]> {
    let listed: Awaited<ReturnType<BrokeredBrowser["listTargets"]>>;
    try {
      listed = await browser.listTargets();
    } catch (error) {
      throw upstreamError("target inventory failed", error);
    }
    const pages = listed.filter((target) => target.type === "page");
    const byId = new Map(pages.map((target) => [target.targetId, target]));
    if (this.#orderSeeded) {
      this.#targetOrder = this.#targetOrder.filter((targetId) =>
        byId.has(targetId)
      );
      const known = new Set(this.#targetOrder);
      this.#targetOrder.push(
        ...pages
          .map((target) => target.targetId)
          .filter((targetId) => !known.has(targetId))
      );
    } else {
      // CDP target enumeration order is not deterministic. Creation order is
      // the launch tab first, then journal-restored tabs in restore order.
      const restored = this.#supervisor.restoredTargets(canonicalOwnerId);
      const restoredSet = new Set(restored);
      this.#targetOrder = [
        ...pages
          .map((target) => target.targetId)
          .filter((targetId) => !restoredSet.has(targetId)),
        ...restored.filter((targetId) => byId.has(targetId)),
      ];
      this.#orderSeeded = true;
    }
    for (const targetId of this.#sessions.keys()) {
      if (!byId.has(targetId)) {
        this.#sessions.delete(targetId);
      }
    }
    return this.#targetOrder.flatMap((targetId) => {
      const target = byId.get(targetId);
      return target ? [target] : [];
    });
  }

  async #navigationState(browser: BrokeredBrowser, targetId: string) {
    try {
      const sessionId = await this.#sessionFor(browser, targetId);
      const history = await browser.send<NavigationHistory>(
        "Page.getNavigationHistory",
        {},
        sessionId
      );
      return {
        canGoBack: history.currentIndex > 0,
        canGoForward: history.currentIndex < history.entries.length - 1,
      };
    } catch {
      return { canGoBack: false, canGoForward: false };
    }
  }

  #pruneViewSessions() {
    const now = this.#now();
    for (const [token, session] of this.#viewSessions) {
      if (session.expiresAt <= now) {
        this.#viewSessions.delete(token);
      }
    }
  }

  async #requireAvailable() {
    if (!(this.#enabled && (await this.#supervisor.findExecutable()))) {
      throw new BrowserServiceError(
        "browser_not_available",
        "The VibePad Browser needs Google Chrome or Chromium installed on this host",
        503
      );
    }
  }

  async #requireBrowser(): Promise<BrokeredBrowser> {
    await this.#requireAvailable();
    try {
      return await this.#browser();
    } catch (error) {
      throw upstreamError("failed to start", error);
    }
  }

  #resolveActiveTarget(targets: readonly PageTargetInfo[]) {
    const activeTargetId = targets.some(
      (target) => target.targetId === this.#activeTargetId
    )
      ? this.#activeTargetId
      : targets[0]?.targetId;
    this.#activeTargetId = activeTargetId;
    return activeTargetId;
  }

  #retargetViews() {
    for (const view of this.#views) {
      if (view.viewedTargetId !== this.#activeTargetId) {
        view.retarget();
      }
    }
  }

  async #sessionFor(browser: BrokeredBrowser, targetId: string) {
    const cached = this.#sessions.get(targetId);
    if (cached) {
      return cached;
    }
    let attached: { sessionId: string };
    try {
      attached = await browser.send<{ sessionId: string }>(
        "Target.attachToTarget",
        { flatten: true, targetId }
      );
      await browser
        .send("Page.enable", {}, attached.sessionId)
        .catch(() => undefined);
    } catch (error) {
      throw targetError(targetId, error);
    }
    this.#sessions.set(targetId, attached.sessionId);
    return attached.sessionId;
  }

  async #snapshot() {
    // Persist the surface's restorable targets in creation order so a host
    // restart reopens the same tabs. Snapshot failures never fail the request.
    await this.#supervisor
      .snapshotTargets(canonicalOwnerId, [...this.#targetOrder])
      .catch(() => undefined);
  }

  #validViewToken(token: string) {
    this.#pruneViewSessions();
    return this.#viewSessions.has(digest(token));
  }
}
