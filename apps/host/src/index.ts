import type { HarnessAdapter } from "@vibepad/protocol/provider";
import { CodexAdapter } from "@vibepad/provider-codex/adapter";
import { OpenCodeAdapter } from "@vibepad/provider-opencode/adapter";
import { serve } from "bun";

import { loadHostConfig } from "./config";
import { bearerFromWebSocketProtocol, HostAuthService } from "./host-auth";
import { isTrustedLocalRequest } from "./host-auth-contract";
import { createRequestHandler } from "./http";
import { ManagedOpenCodeRuntime } from "./open-code-runtime";
import { SqliteProviderEventStore } from "./provider-event-store";
import { ProviderRouter } from "./provider-router";
import { SqliteProviderSessionStore } from "./provider-session-store";
import { VoiceCredentialService } from "./voice-credentials";
import { VoiceHttpService } from "./voice-http";
import {
  VoiceRealtimeBridge,
  type VoiceRealtimeSocketData,
} from "./voice-realtime";

const config = loadHostConfig();
const providerEvents = new SqliteProviderEventStore(
  config.providerEventDatabase
);
const providerSessions = new SqliteProviderSessionStore(
  config.providerSessionDatabase
);
const openCodeRuntime =
  config.openCodeEnabled && config.openCodeManaged
    ? new ManagedOpenCodeRuntime({
        baseUrl: config.openCodeBaseUrl,
        cwd: config.codexProjectRoots[0] ?? process.cwd(),
        executable: config.openCodeExecutable,
        ...(config.openCodePassword
          ? { password: config.openCodePassword }
          : {}),
        username: config.openCodeUsername,
      })
    : undefined;
if (openCodeRuntime) {
  const runtimeState = await openCodeRuntime.start();
  console.info(`VibePad ${runtimeState} the OpenCode server`);
}

const adapters: (HarnessAdapter & {
  readonly dispose?: () => Promise<void>;
})[] = [];
if (config.openCodeEnabled) {
  adapters.push(
    new OpenCodeAdapter({
      baseUrl: config.openCodeBaseUrl,
      ...(config.openCodePassword ? { password: config.openCodePassword } : {}),
      username: config.openCodeUsername,
    })
  );
}
if (config.codexEnabled) {
  adapters.push(
    new CodexAdapter({
      command: [config.codexExecutable, "app-server", "--listen", "stdio://"],
      eventStore: providerEvents,
      projectRoots: config.codexProjectRoots,
      sessionControlStore: providerSessions,
    })
  );
}
if (adapters.length === 0) {
  throw new Error("VibePad Host requires at least one enabled harness");
}
const providers = new ProviderRouter(adapters);
const hostAuth = new HostAuthService({
  databasePath: config.hostAuthDatabase,
  hostId: config.hostId,
  hostName: config.hostName,
});
const pairingCode = hostAuth.createPairingCode();
const voiceCredentials = new VoiceCredentialService({
  baseUrl: config.voiceBaseUrl,
  hostId: config.hostId,
  hostName: config.hostName,
  ...(config.voiceApiKey ? { apiKey: config.voiceApiKey } : {}),
});
const voiceHttp = new VoiceHttpService({
  baseUrl: config.voiceBaseUrl,
  credentials: voiceCredentials,
});
const requestHandler = createRequestHandler(
  providers,
  config.hostName,
  voiceHttp,
  hostAuth
);
const voiceRealtime = new VoiceRealtimeBridge({
  baseUrl: config.voiceBaseUrl,
  credentials: voiceCredentials,
});
const server = serve<VoiceRealtimeSocketData>({
  fetch(request, bunServer) {
    if (new URL(request.url).pathname === "/v1/voice/realtime") {
      const remoteAddress = bunServer.requestIP(request)?.address;
      if (
        !isTrustedLocalRequest(remoteAddress, request.headers.get("origin"))
      ) {
        const credential = bearerFromWebSocketProtocol(
          request.headers.get("sec-websocket-protocol")
        );
        if (!credential) {
          return Response.json(
            {
              error: "unauthorized",
              message: "Pair this device with the VibePad host",
            },
            { status: 401 }
          );
        }
        const principal = hostAuth.authenticateToken(credential.token);
        if (!principal) {
          return Response.json(
            {
              error: "unauthorized",
              message: "Pair this device with the VibePad host",
            },
            { status: 401 }
          );
        }
        return voiceRealtime.handleUpgrade(request, bunServer, {
          acceptedProtocol: credential.protocol,
          principal,
        });
      }
      return voiceRealtime.handleUpgrade(request, bunServer);
    }
    return requestHandler(request, bunServer);
  },
  hostname: config.hostname,
  port: config.port,
  websocket: voiceRealtime.websocket,
});

console.info(`VibePad host listening at ${server.url}`);
console.info(
  `VibePad pairing code ${pairingCode.code} expires at ${pairingCode.expiresAt}`
);

let shuttingDown = false;
const shutdown = async () => {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  server.stop();
  try {
    await providers.dispose();
  } finally {
    try {
      await openCodeRuntime?.dispose();
    } finally {
      try {
        providerSessions.close();
      } finally {
        try {
          providerEvents.close();
        } finally {
          hostAuth.close();
        }
      }
    }
  }
};

process.once("SIGINT", () => {
  shutdown().catch(() => undefined);
});
process.once("SIGTERM", () => {
  shutdown().catch(() => undefined);
});
