import type { Server, ServerWebSocket, WebSocketHandler } from "bun";

import type { BrowserService } from "./browser-service";

const maxPendingBrowserBytes = 16 * 1024 * 1024;

export interface BrowserViewSocketData {
  closed: boolean;
  kind: "browser";
  pending: (string | Uint8Array<ArrayBuffer>)[];
  pendingBytes: number;
  protocol: string | undefined;
  upstream: WebSocket | undefined;
}

const pendingSize = (message: string | Uint8Array<ArrayBuffer>) =>
  typeof message === "string"
    ? new TextEncoder().encode(message).byteLength
    : message.byteLength;

const forwardUpstreamMessage = async (
  client: ServerWebSocket<BrowserViewSocketData>,
  data: unknown
) => {
  if (typeof data === "string") {
    client.sendText(data);
    return;
  }
  if (data instanceof ArrayBuffer) {
    client.sendBinary(data);
    return;
  }
  if (ArrayBuffer.isView(data)) {
    client.sendBinary(
      data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
    );
    return;
  }
  if (data instanceof Blob) {
    client.sendBinary(await data.arrayBuffer());
  }
};

const requestedProtocol = (request: Request) =>
  request.headers
    .get("sec-websocket-protocol")
    ?.split(",")
    .map((value) => value.trim())
    .find(Boolean);

export class BrowserViewBridge {
  readonly #browser: BrowserService;

  constructor(browser: BrowserService) {
    this.#browser = browser;
  }

  readonly websocket: WebSocketHandler<BrowserViewSocketData> = {
    close: (client) => {
      client.data.closed = true;
      const { upstream } = client.data;
      if (
        upstream &&
        (upstream.readyState === WebSocket.CONNECTING ||
          upstream.readyState === WebSocket.OPEN)
      ) {
        upstream.close(1000, "VibePad browser view disconnected");
      }
    },
    idleTimeout: 0,
    maxPayloadLength: maxPendingBrowserBytes,
    message: (client, message) => {
      const outgoing =
        typeof message === "string" ? message : Uint8Array.from(message);
      const { upstream } = client.data;
      if (upstream?.readyState === WebSocket.OPEN) {
        upstream.send(outgoing);
        return;
      }
      const nextBytes = client.data.pendingBytes + pendingSize(outgoing);
      if (nextBytes > maxPendingBrowserBytes) {
        client.close(1009, "Browser view connection did not become ready");
        return;
      }
      client.data.pending.push(outgoing);
      client.data.pendingBytes = nextBytes;
    },
    open: (client) => {
      this.#openUpstream(client);
    },
    perMessageDeflate: false,
  };

  handleUpgrade(
    request: Request,
    server: Server<BrowserViewSocketData>
  ): Response | undefined {
    const { pathname } = new URL(request.url);
    if (!this.#browser.authorizeSocket(pathname)) {
      return Response.json(
        { error: "browser_view_unauthorized" },
        { status: 401 }
      );
    }
    const protocol = requestedProtocol(request);
    const upgraded = server.upgrade(request, {
      data: {
        closed: false,
        kind: "browser",
        pending: [],
        pendingBytes: 0,
        protocol,
        upstream: undefined,
      },
      ...(protocol ? { headers: { "Sec-WebSocket-Protocol": protocol } } : {}),
    });
    return upgraded
      ? undefined
      : Response.json({ error: "websocket_upgrade_failed" }, { status: 400 });
  }

  #openUpstream(client: ServerWebSocket<BrowserViewSocketData>) {
    const upstream = new WebSocket(
      this.#browser.browserSocketUrl(),
      client.data.protocol
    );
    upstream.binaryType = "arraybuffer";
    client.data.upstream = upstream;
    upstream.addEventListener("open", () => {
      if (client.data.closed) {
        upstream.close(1000, "VibePad browser view disconnected");
        return;
      }
      for (const pending of client.data.pending) {
        upstream.send(pending);
      }
      client.data.pending = [];
      client.data.pendingBytes = 0;
    });
    upstream.addEventListener("message", (event) => {
      forwardUpstreamMessage(client, event.data).catch(() => {
        client.close(1011, "Invalid browser view response");
      });
    });
    upstream.addEventListener("close", (event) => {
      if (!client.data.closed) {
        client.close(event.code || 1011, event.reason || "Browser view closed");
      }
    });
    upstream.addEventListener("error", () => {
      if (!client.data.closed) {
        client.close(1011, "Unable to connect to VibePad Browser");
      }
    });
  }
}
