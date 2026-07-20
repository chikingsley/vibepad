import { serve } from "bun";

import type { HostAuthPrincipal } from "./host-auth-contract";
import { VoiceCredentialService } from "./voice-credentials";
import {
  VoiceRealtimeBridge,
  type VoiceRealtimeSocketData,
} from "./voice-realtime";

const authorization = { value: "" };
const clientMetadata = { value: {} as Record<string, string | null> };
const mintCount = { value: 0 };
const mintRequest = { value: undefined as unknown };
const upstreamQuery = { value: "" };
const audioChunks: number[][] = [];

const principal: HostAuthPrincipal = {
  clientMetadata: {
    appId: "studio.peacockery.vibepad",
    appVersion: "1.0.0",
    clientVersion: "1.0.0",
    deviceModel: "iPad Pro 13-inch (M4)",
    installationId: "92dc9ebf-3093-43da-84b7-242006585440",
    osVersion: "26.0",
    platform: "ios",
  },
  deviceId: "507c7cc3-8247-4fab-86a7-23b666316e8f",
  deviceName: "Fixture iPad",
};

const upstream = serve({
  async fetch(request, server) {
    const url = new URL(request.url);
    if (url.pathname === "/v1/auth/client-tokens") {
      mintCount.value += 1;
      mintRequest.value = await request.json();
      if (
        request.headers.get("authorization") !== "Bearer fixture-parent-key"
      ) {
        return new Response("Unauthorized", { status: 401 });
      }
      return Response.json(
        {
          credential_id: "token_fixture",
          environment: "lab",
          expires_at: new Date(Date.now() + 3_600_000).toISOString(),
          key: "pvc_fixture-child-token",
          key_prefix: "pvc_fixt",
          scopes: [
            "models:read",
            "text:write",
            "transcriptions:read",
            "transcriptions:write",
          ],
          token_type: "Bearer",
        },
        { status: 201 }
      );
    }
    authorization.value = request.headers.get("authorization") ?? "";
    clientMetadata.value = {
      deviceId: request.headers.get("x-peacockery-device-id"),
      deviceModel: request.headers.get("x-peacockery-device-model"),
      installationId: request.headers.get("x-peacockery-installation-id"),
      osVersion: request.headers.get("x-peacockery-os-version"),
      platform: request.headers.get("x-peacockery-platform"),
    };
    upstreamQuery.value = url.search;
    return server.upgrade(request)
      ? undefined
      : new Response("Upgrade failed", { status: 400 });
  },
  hostname: "127.0.0.1",
  port: 0,
  websocket: {
    message(socket, message) {
      if (typeof message !== "string") {
        audioChunks.push([...message]);
        return;
      }
      if (message !== JSON.stringify({ type: "close" })) {
        socket.close(1008, "Unexpected command");
        return;
      }
      socket.send(
        JSON.stringify({
          protocol_version: 1,
          result: { content: { text: "voice bridge works" } },
          sequence: 2,
          session_id: "fixture-session",
          status: "succeeded",
          type: "session.completed",
        })
      );
    },
    open(socket) {
      socket.send(
        JSON.stringify({
          language: "en",
          model: "elevenlabs-scribe_v2",
          protocol_version: 1,
          sequence: 1,
          session_id: "fixture-session",
          type: "session.started",
        })
      );
    },
  },
});

const credentials = new VoiceCredentialService({
  apiKey: "fixture-parent-key",
  baseUrl: upstream.url.toString(),
  hostId: "fixture-host",
  hostName: "Fixture host",
});
const bridge = new VoiceRealtimeBridge({
  baseUrl: upstream.url.toString(),
  credentials,
});
const bridgeServer = serve<VoiceRealtimeSocketData>({
  fetch: (request, server) =>
    bridge.handleUpgrade(request, server, { principal }),
  hostname: "127.0.0.1",
  port: 0,
  websocket: bridge.websocket,
});

try {
  const terminal = await new Promise<Record<string, unknown>>(
    (resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Voice bridge fixture timed out")),
        5000
      );
      const url = new URL("/v1/voice/realtime", bridgeServer.url);
      url.protocol = "ws:";
      const client = new WebSocket(url);
      client.addEventListener("open", () => {
        client.send(Uint8Array.from([1, 2, 3, 4]));
        client.send(JSON.stringify({ type: "close" }));
      });
      client.addEventListener("message", (event) => {
        if (typeof event.data !== "string") {
          return;
        }
        const message = JSON.parse(event.data) as { type?: unknown };
        if (message.type === "session.completed") {
          clearTimeout(timeout);
          client.close();
          resolve(message);
        }
      });
      client.addEventListener("error", () => {
        clearTimeout(timeout);
        reject(new Error("Voice bridge client failed"));
      });
    }
  );

  console.log(
    JSON.stringify({
      audioChunks,
      authorization: authorization.value,
      clientMetadata: clientMetadata.value,
      mintCount: mintCount.value,
      mintRequest: mintRequest.value,
      terminal,
      upstreamQuery: upstreamQuery.value,
    })
  );
} finally {
  bridgeServer.stop(true);
  upstream.stop(true);
}
