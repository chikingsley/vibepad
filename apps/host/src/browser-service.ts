import { createHash, randomBytes } from "node:crypto";
import {
  type BrowserState,
  type BrowserTarget,
  type BrowserTargetActionRequest,
  type BrowserViewSession,
  browserPath,
  browserSocketPathPrefix,
  browserTargetActionRequestSchema,
  browserTargetsPath,
  browserViewPathPrefix,
  browserViewSessionsPath,
  createBrowserTargetRequestSchema,
} from "@vibepad/protocol/browser";

import type { HostAuthPrincipal } from "./host-auth-contract";

const browserViewAssetPathPattern = /^\/v1\/browser\/view\/([^/]+)\/(.+)$/u;
const browserSocketPathPattern = /^\/v1\/browser\/socket\/([^/]+)$/u;
const trailingSlashPattern = /\/$/u;
const viewSessionTtlMs = 10 * 60 * 1000;
const cdpRequestTimeoutMs = 5000;
const unsafeProxyHeaders = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

interface CdpTarget extends BrowserTarget {
  readonly type: string;
  readonly webSocketDebuggerUrl?: string;
}

interface ViewSessionRecord {
  readonly deviceId: string;
  readonly expiresAt: number;
}

type BrowserFetch = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

type BrowserWebSocket = Pick<WebSocket, "addEventListener" | "close" | "send">;

type BrowserWebSocketFactory = (url: string) => BrowserWebSocket;

export type BrowserServiceErrorCode =
  | "browser_not_available"
  | "browser_target_not_found"
  | "browser_upstream_unavailable"
  | "browser_view_unauthorized";

export class BrowserServiceError extends Error {
  readonly code: BrowserServiceErrorCode;
  readonly status: number;

  constructor(code: BrowserServiceErrorCode, message: string, status: number) {
    super(message);
    this.name = "BrowserServiceError";
    this.code = code;
    this.status = status;
  }
}

export interface BrowserServiceConfig {
  readonly cdpUrl?: string;
  readonly enabled: boolean;
  readonly fetcher?: BrowserFetch;
  readonly now?: () => number;
  readonly surfaceUrl?: string;
  readonly webSocketFactory?: BrowserWebSocketFactory;
}

const digest = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");

const isCdpTarget = (value: unknown): value is CdpTarget => {
  if (!(value && typeof value === "object")) {
    return false;
  }
  const candidate = value as Partial<CdpTarget>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.type === "string" &&
    typeof candidate.url === "string" &&
    (candidate.webSocketDebuggerUrl === undefined ||
      typeof candidate.webSocketDebuggerUrl === "string")
  );
};

const publicTarget = ({ id, title, url }: CdpTarget): BrowserTarget => ({
  id,
  title,
  url,
});

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

const createDefaultWebSocket = (url: string) => new WebSocket(url);

export class BrowserService {
  readonly #cdpUrl: string | undefined;
  readonly #enabled: boolean;
  readonly #fetch: BrowserFetch;
  readonly #now: () => number;
  readonly #surfaceUrl: string | undefined;
  readonly #viewSessions = new Map<string, ViewSessionRecord>();
  readonly #webSocketFactory: BrowserWebSocketFactory;
  #activeTargetId: string | undefined;
  #targetOrder: string[] = [];

  constructor(config: BrowserServiceConfig) {
    this.#cdpUrl = config.cdpUrl?.replace(trailingSlashPattern, "");
    this.#enabled = config.enabled;
    this.#fetch = config.fetcher ?? fetch;
    this.#now = config.now ?? Date.now;
    this.#surfaceUrl = config.surfaceUrl?.replace(trailingSlashPattern, "");
    this.#webSocketFactory = config.webSocketFactory ?? createDefaultWebSocket;
  }

  get available() {
    return Boolean(this.#enabled && this.#cdpUrl && this.#surfaceUrl);
  }

  isSocketRequest(pathname: string) {
    return browserSocketPathPattern.test(pathname);
  }

  isViewAssetRequest(pathname: string) {
    return browserViewAssetPathPattern.test(pathname);
  }

  authorizeSocket(pathname: string) {
    const token = browserSocketPathPattern.exec(pathname)?.[1];
    return Boolean(token && this.#validViewToken(token));
  }

  browserSocketUrl() {
    this.#assertAvailable();
    const url = new URL("/websockify", this.#surfaceUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    return url.toString();
  }

  async handleViewAsset(request: Request, url: URL): Promise<Response> {
    this.#assertAvailable();
    if (request.method !== "GET") {
      return json({ error: "method_not_allowed" }, 405);
    }
    const match = browserViewAssetPathPattern.exec(url.pathname);
    const token = match?.[1];
    const assetPath = match?.[2];
    if (!(token && assetPath && this.#validViewToken(token))) {
      throw new BrowserServiceError(
        "browser_view_unauthorized",
        "The browser view session is invalid or expired",
        401
      );
    }
    const upstreamUrl = new URL(`/${assetPath}`, `${this.#surfaceUrl}/`);
    upstreamUrl.search = url.search;
    const upstream = await this.#fetch(upstreamUrl, {
      headers: { Accept: request.headers.get("accept") ?? "*/*" },
      signal: request.signal,
    });
    const headers = new Headers();
    upstream.headers.forEach((value, key) => {
      if (!unsafeProxyHeaders.has(key.toLowerCase())) {
        headers.set(key, value);
      }
    });
    return new Response(upstream.body, {
      headers,
      status: upstream.status,
      statusText: upstream.statusText,
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
      return json({ data: this.createViewSession(principal) }, 201);
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
    if (!this.available) {
      return {
        available: false,
        canGoBack: false,
        canGoForward: false,
        healthy: false,
        targets: [],
      };
    }
    try {
      const targets = await this.#targets();
      const activeTargetId = targets.some(
        (target) => target.id === this.#activeTargetId
      )
        ? this.#activeTargetId
        : targets[0]?.id;
      this.#activeTargetId = activeTargetId;
      const activeTarget = targets.find(
        (target) => target.id === activeTargetId
      );
      const navigation = activeTarget
        ? await this.#navigationState(activeTarget)
        : { canGoBack: false, canGoForward: false };
      return {
        ...(activeTargetId ? { activeTargetId } : {}),
        available: true,
        ...navigation,
        healthy: true,
        targets: targets.map(publicTarget),
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

  createViewSession(principal?: HostAuthPrincipal): BrowserViewSession {
    this.#assertAvailable();
    this.#pruneViewSessions();
    const token = randomBytes(32).toString("base64url");
    const expiresAt = this.#now() + viewSessionTtlMs;
    this.#viewSessions.set(digest(token), {
      deviceId: principal?.deviceId ?? "local",
      expiresAt,
    });
    const query = new URLSearchParams({
      autoconnect: "true",
      path: `${browserSocketPathPrefix.slice(1)}/${token}`,
      reconnect: "true",
      reconnect_delay: "1000",
      resize: "remote",
      show_dot: "true",
    });
    return {
      expiresAt: new Date(expiresAt).toISOString(),
      path: `${browserViewPathPrefix}/${token}/vnc.html?${query}`,
    };
  }

  revokeDevice(deviceId: string): void {
    for (const [token, session] of this.#viewSessions) {
      if (session.deviceId === deviceId) {
        this.#viewSessions.delete(token);
      }
    }
  }

  async createTarget(url: string): Promise<BrowserTarget> {
    this.#assertAvailable();
    const response = await this.#fetch(
      `${this.#cdpUrl}/json/new?${encodeURIComponent(url)}`,
      { method: "PUT", signal: AbortSignal.timeout(cdpRequestTimeoutMs) }
    );
    if (!response.ok) {
      throw this.#upstreamError(`could not open ${url}`, response.status);
    }
    const value = (await response.json()) as unknown;
    if (!isCdpTarget(value)) {
      throw this.#upstreamError("returned an invalid target");
    }
    this.#activeTargetId = value.id;
    this.#targetOrder = [
      ...this.#targetOrder.filter((targetId) => targetId !== value.id),
      value.id,
    ];
    return publicTarget(value);
  }

  async closeTarget(targetId: string): Promise<void> {
    this.#assertAvailable();
    const targets = await this.#targets();
    if (targets.length === 1 && targets[0]?.id === targetId) {
      const replacement = await this.#fetch(
        `${this.#cdpUrl}/json/new?${encodeURIComponent("about:blank")}`,
        { method: "PUT", signal: AbortSignal.timeout(cdpRequestTimeoutMs) }
      );
      if (!replacement.ok) {
        throw this.#upstreamError("could not retain a blank browser target");
      }
    }
    const response = await this.#fetch(
      `${this.#cdpUrl}/json/close/${encodeURIComponent(targetId)}`,
      { signal: AbortSignal.timeout(cdpRequestTimeoutMs) }
    );
    if (!response.ok) {
      throw this.#targetError(targetId);
    }
    if (this.#activeTargetId === targetId) {
      this.#activeTargetId = undefined;
    }
    this.#targetOrder = this.#targetOrder.filter(
      (orderedTargetId) => orderedTargetId !== targetId
    );
  }

  async performAction(
    targetId: string,
    action: BrowserTargetActionRequest
  ): Promise<void> {
    this.#assertAvailable();
    if (action.action === "activate") {
      const response = await this.#fetch(
        `${this.#cdpUrl}/json/activate/${encodeURIComponent(targetId)}`,
        { signal: AbortSignal.timeout(cdpRequestTimeoutMs) }
      );
      if (!response.ok) {
        throw this.#targetError(targetId);
      }
      this.#activeTargetId = targetId;
      return;
    }
    const target = await this.#target(targetId);
    if (!target.webSocketDebuggerUrl) {
      throw this.#upstreamError(`target ${targetId} has no debugger socket`);
    }
    if (action.action === "navigate") {
      await this.#cdpCommand(target.webSocketDebuggerUrl, "Page.navigate", {
        url: action.url,
      });
      return;
    }
    if (action.action === "reload") {
      await this.#cdpCommand(target.webSocketDebuggerUrl, "Page.reload");
      return;
    }
    const history = await this.#cdpCommand<{
      readonly currentIndex: number;
      readonly entries: readonly { readonly id: number }[];
    }>(target.webSocketDebuggerUrl, "Page.getNavigationHistory");
    const nextIndex =
      action.action === "back"
        ? history.currentIndex - 1
        : history.currentIndex + 1;
    const entry = history.entries[nextIndex];
    if (!entry) {
      return;
    }
    await this.#cdpCommand(
      target.webSocketDebuggerUrl,
      "Page.navigateToHistoryEntry",
      { entryId: entry.id }
    );
  }

  #cdpCommand<TResult = unknown>(
    socketUrl: string,
    method: string,
    params: Record<string, unknown> = {}
  ): Promise<TResult> {
    const socket = this.#webSocketFactory(socketUrl);
    return new Promise<TResult>((resolveCommand, rejectCommand) => {
      const timeout = setTimeout(() => {
        socket.close();
        rejectCommand(this.#upstreamError(`${method} timed out`));
      }, cdpRequestTimeoutMs);
      socket.addEventListener("open", () => {
        socket.send(JSON.stringify({ id: 1, method, params }));
      });
      socket.addEventListener("message", (event) => {
        if (typeof event.data !== "string") {
          return;
        }
        const response = JSON.parse(event.data) as {
          readonly error?: { readonly message?: string };
          readonly id?: number;
          readonly result?: TResult;
        };
        if (response.id !== 1) {
          return;
        }
        clearTimeout(timeout);
        socket.close();
        if (response.error) {
          rejectCommand(
            this.#upstreamError(response.error.message ?? `${method} failed`)
          );
          return;
        }
        resolveCommand(response.result as TResult);
      });
      socket.addEventListener("error", () => {
        clearTimeout(timeout);
        rejectCommand(this.#upstreamError(`${method} failed`));
      });
    });
  }

  async #target(targetId: string) {
    const target = (await this.#targets()).find(
      (candidate) => candidate.id === targetId
    );
    if (!target) {
      throw this.#targetError(targetId);
    }
    return target;
  }

  async #navigationState(target: CdpTarget) {
    if (!target.webSocketDebuggerUrl) {
      return { canGoBack: false, canGoForward: false };
    }
    try {
      const history = await this.#cdpCommand<{
        readonly currentIndex: number;
        readonly entries: readonly { readonly id: number }[];
      }>(target.webSocketDebuggerUrl, "Page.getNavigationHistory");
      return {
        canGoBack: history.currentIndex > 0,
        canGoForward: history.currentIndex < history.entries.length - 1,
      };
    } catch {
      return { canGoBack: false, canGoForward: false };
    }
  }

  async #targets(): Promise<readonly CdpTarget[]> {
    this.#assertAvailable();
    const response = await this.#fetch(`${this.#cdpUrl}/json/list`, {
      signal: AbortSignal.timeout(cdpRequestTimeoutMs),
    });
    if (!response.ok) {
      throw this.#upstreamError("target inventory failed", response.status);
    }
    const value = (await response.json()) as unknown;
    if (!Array.isArray(value)) {
      return [];
    }
    const targets = value.filter(
      (target): target is CdpTarget =>
        isCdpTarget(target) && target.type === "page"
    );
    const targetsById = new Map(targets.map((target) => [target.id, target]));
    if (this.#targetOrder.length === 0) {
      // Chrome reports page targets newest first. Product tabs read in creation
      // order, so the initial inventory starts with Chrome's oldest target.
      this.#targetOrder = targets.map((target) => target.id).reverse();
    } else {
      this.#targetOrder = this.#targetOrder.filter((targetId) =>
        targetsById.has(targetId)
      );
      const known = new Set(this.#targetOrder);
      const newTargets = targets
        .filter((target) => !known.has(target.id))
        .map((target) => target.id)
        .reverse();
      this.#targetOrder.push(...newTargets);
    }
    return this.#targetOrder.flatMap((targetId) => {
      const target = targetsById.get(targetId);
      return target ? [target] : [];
    });
  }

  #assertAvailable() {
    if (!this.available) {
      throw new BrowserServiceError(
        "browser_not_available",
        "The VibePad Browser is not installed on this host",
        503
      );
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

  #validViewToken(token: string) {
    this.#pruneViewSessions();
    return this.#viewSessions.has(digest(token));
  }

  #targetError(targetId: string) {
    return new BrowserServiceError(
      "browser_target_not_found",
      `Browser target ${targetId} was not found`,
      404
    );
  }

  #upstreamError(detail: string, status = 503) {
    return new BrowserServiceError(
      "browser_upstream_unavailable",
      `VibePad Browser ${detail}`,
      status === 404 ? 404 : 503
    );
  }
}
