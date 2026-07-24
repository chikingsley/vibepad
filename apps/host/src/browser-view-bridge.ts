import type { Server, WebSocketHandler } from "bun";

import type {
  BrowserService,
  BrowserViewConnectionHandle,
} from "./browser-service";

const maxViewMessageBytes = 64 * 1024;

export interface BrowserViewSocketData {
  connection: BrowserViewConnectionHandle | undefined;
  kind: "browser";
  pathname: string;
}

export class BrowserViewBridge {
  readonly #browser: BrowserService;

  constructor(browser: BrowserService) {
    this.#browser = browser;
  }

  readonly websocket: WebSocketHandler<BrowserViewSocketData> = {
    close: (client) => {
      client.data.connection?.closed();
      client.data.connection = undefined;
    },
    idleTimeout: 0,
    maxPayloadLength: maxViewMessageBytes,
    message: (client, message) => {
      if (typeof message !== "string") {
        client.close(1003, "Browser view messages are JSON text");
        return;
      }
      client.data.connection?.message(message);
    },
    open: (client) => {
      const connection = this.#browser.connectView(client.data.pathname, {
        close: (code, reason) => client.close(code, reason),
        send: (data) => client.sendText(data),
      });
      if (!connection) {
        client.close(1008, "The browser view session is invalid or expired");
        return;
      }
      client.data.connection = connection;
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
    const upgraded = server.upgrade(request, {
      data: {
        connection: undefined,
        kind: "browser",
        pathname,
      } satisfies BrowserViewSocketData,
    });
    return upgraded
      ? undefined
      : Response.json({ error: "websocket_upgrade_failed" }, { status: 400 });
  }
}
