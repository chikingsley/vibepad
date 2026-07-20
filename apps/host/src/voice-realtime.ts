import {
  voiceRealtimeClientCommandSchema,
  voiceRealtimeModel,
  voiceRealtimePath,
} from "@vibepad/protocol/voice";
import type { Server, ServerWebSocket, WebSocketHandler } from "bun";

import type { HostAuthPrincipal } from "./host-auth-contract";
import type { VoiceCredentialService } from "./voice-credentials";

const maxPendingAudioBytes = 8 * 1024 * 1024;

type BunWebSocketConstructor = new (
  url: string | URL,
  options: Bun.WebSocketOptions
) => WebSocket;

const AuthenticatedWebSocket = WebSocket as unknown as BunWebSocketConstructor;

export interface VoiceRealtimeSocketData {
  closed: boolean;
  kind: "voice";
  pending: (string | Uint8Array<ArrayBuffer>)[];
  pendingBytes: number;
  principal: HostAuthPrincipal | undefined;
  upstream: WebSocket | undefined;
}

export interface VoiceRealtimeConfig {
  readonly baseUrl: string;
  readonly credentials: VoiceCredentialService;
}

export interface VoiceRealtimeUpgradeOptions {
  readonly acceptedProtocol?: string;
  readonly principal?: HostAuthPrincipal;
}

const asWebSocketUrl = (baseUrl: string) => {
  const url = new URL("/v1/realtime", baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("channels", "1");
  url.searchParams.set("dictation", "true");
  url.searchParams.set("encoding", "linear16");
  url.searchParams.set("interim_results", "true");
  url.searchParams.set("model", voiceRealtimeModel);
  url.searchParams.set("punctuate", "true");
  url.searchParams.set("sample_rate", "16000");
  url.searchParams.set("target_streaming_delay_ms", "200");
  return url;
};

const pendingSize = (message: string | Uint8Array<ArrayBuffer>) =>
  typeof message === "string"
    ? new TextEncoder().encode(message).byteLength
    : message.byteLength;

const sendUpstream = (
  upstream: WebSocket,
  message: string | Uint8Array<ArrayBuffer>
) => {
  upstream.send(message);
};

const forwardUpstreamMessage = async (
  client: ServerWebSocket<VoiceRealtimeSocketData>,
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

export class VoiceRealtimeBridge {
  readonly #credentials: VoiceCredentialService;
  readonly #upstreamUrl: URL;

  constructor(config: VoiceRealtimeConfig) {
    this.#credentials = config.credentials;
    this.#upstreamUrl = asWebSocketUrl(config.baseUrl);
  }

  get available() {
    return this.#credentials.configured;
  }

  readonly websocket: WebSocketHandler<VoiceRealtimeSocketData> = {
    close: (client) => {
      client.data.closed = true;
      const { upstream } = client.data;
      if (
        upstream &&
        (upstream.readyState === WebSocket.CONNECTING ||
          upstream.readyState === WebSocket.OPEN)
      ) {
        upstream.close(1000, "VibePad client disconnected");
      }
    },
    idleTimeout: 300,
    maxPayloadLength: 512 * 1024,
    message: (client, message) => {
      let outgoing: string | Uint8Array<ArrayBuffer>;
      if (typeof message === "string") {
        let candidate: unknown;
        try {
          candidate = JSON.parse(message) as unknown;
        } catch {
          client.close(1008, "Invalid voice command");
          return;
        }
        const command = voiceRealtimeClientCommandSchema.safeParse(candidate);
        if (!command.success) {
          client.close(1008, "Unsupported voice command");
          return;
        }
        outgoing = JSON.stringify(command.data);
      } else {
        outgoing = Uint8Array.from(message);
      }

      const { upstream } = client.data;
      if (upstream?.readyState === WebSocket.OPEN) {
        sendUpstream(upstream, outgoing);
        return;
      }

      const nextBytes = client.data.pendingBytes + pendingSize(outgoing);
      if (nextBytes > maxPendingAudioBytes) {
        client.close(1009, "Voice connection did not become ready");
        return;
      }
      client.data.pending.push(outgoing);
      client.data.pendingBytes = nextBytes;
    },
    open: (client) => {
      this.#openUpstream(client).catch(() => {
        if (!client.data.closed) {
          client.close(1011, "Unable to connect to Voice Lab");
        }
      });
    },
    perMessageDeflate: false,
  };

  handleUpgrade(
    request: Request,
    server: Server<VoiceRealtimeSocketData>,
    options: VoiceRealtimeUpgradeOptions = {}
  ): Response | undefined {
    const url = new URL(request.url);
    if (url.pathname !== voiceRealtimePath) {
      return new Response("Not found", { status: 404 });
    }
    if (!this.#credentials.configured) {
      return Response.json({ error: "voice_not_configured" }, { status: 503 });
    }
    const upgraded = server.upgrade(request, {
      data: {
        closed: false,
        kind: "voice",
        pending: [],
        pendingBytes: 0,
        principal: options.principal,
        upstream: undefined,
      },
      ...(options.acceptedProtocol
        ? {
            headers: {
              "Sec-WebSocket-Protocol": options.acceptedProtocol,
            },
          }
        : {}),
    });
    return upgraded
      ? undefined
      : Response.json({ error: "websocket_upgrade_failed" }, { status: 400 });
  }

  async #openUpstream(
    client: ServerWebSocket<VoiceRealtimeSocketData>
  ): Promise<void> {
    const access = await this.#credentials.accessFor(client.data.principal);
    if (client.data.closed) {
      return;
    }
    const upstream = new AuthenticatedWebSocket(this.#upstreamUrl, {
      headers: {
        ...access.headers,
        Authorization: `Bearer ${access.apiKey}`,
      },
      perMessageDeflate: false,
    });
    upstream.binaryType = "arraybuffer";
    client.data.upstream = upstream;

    upstream.addEventListener("open", () => {
      if (client.data.closed) {
        upstream.close(1000, "VibePad client disconnected");
        return;
      }
      for (const pending of client.data.pending) {
        sendUpstream(upstream, pending);
      }
      client.data.pending = [];
      client.data.pendingBytes = 0;
    });
    upstream.addEventListener("message", (event) => {
      forwardUpstreamMessage(client, event.data).catch(() => {
        client.close(1011, "Invalid Voice Lab response");
      });
    });
    upstream.addEventListener("close", (event) => {
      if (!client.data.closed) {
        client.close(event.code || 1011, event.reason || "Voice Lab closed");
      }
    });
    upstream.addEventListener("error", () => {
      if (!client.data.closed) {
        client.close(1011, "Unable to connect to Voice Lab");
      }
    });
  }
}
