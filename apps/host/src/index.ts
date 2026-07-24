import type { HarnessAdapter } from "@vibepad/protocol/provider";
import { AgyAdapter } from "@vibepad/provider-agy/adapter";
import { AGY_BIN, resolveAgyBin } from "@vibepad/provider-agy/constants";
import { ClaudeCodeAdapter } from "@vibepad/provider-claude-code/adapter";
import { detectClaudeCode } from "@vibepad/provider-claude-code/detect";
import { CodexAdapter } from "@vibepad/provider-codex/adapter";
import { OpenCodeAdapter } from "@vibepad/provider-opencode/adapter";
import {
  type Server,
  type ServerWebSocket,
  serve,
  type WebSocketHandler,
} from "bun";

import { BrowserService } from "./browser-service";
import {
  BrowserViewBridge,
  type BrowserViewSocketData,
} from "./browser-view-bridge";
import { loadHostConfig } from "./config";
import { bearerFromWebSocketProtocol, HostAuthService } from "./host-auth";
import { isTrustedLocalRequest } from "./host-auth-contract";
import { startHostDiscovery } from "./host-discovery";
import { createRequestHandler } from "./http";
import { ManagedOpenCodeRuntime } from "./open-code-runtime";
import { SqliteProviderEventStore } from "./provider-event-store";
import { ProviderRouter } from "./provider-router";
import { SqliteProviderSessionStore } from "./provider-session-store";
import { OpenSshBootstrap } from "./ssh-bootstrap";
import { OpenSshTargetDiscovery } from "./ssh-target-discovery";
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
if (config.claudeCodeEnabled) {
  const claudeCodeDetection = detectClaudeCode(
    config.claudeCodeExecutable
      ? { executable: config.claudeCodeExecutable }
      : {}
  );
  if (claudeCodeDetection.available) {
    adapters.push(
      new ClaudeCodeAdapter({
        detection: claudeCodeDetection,
        eventStore: providerEvents,
        projectRoots: config.codexProjectRoots,
        sessionControlStore: providerSessions,
      })
    );
  } else {
    console.info(
      "VibePad found no Claude Code CLI; the claude-code harness is disabled"
    );
  }
}
if (config.agyEnabled) {
  const agyExecutable = resolveAgyBin();
  if (agyExecutable === AGY_BIN) {
    console.info(
      "VibePad found no Antigravity CLI; the agy harness is disabled"
    );
  } else {
    adapters.push(
      new AgyAdapter({
        eventStore: providerEvents,
        executable: agyExecutable,
        projectRoots: config.codexProjectRoots,
        sessionControlStore: providerSessions,
      })
    );
  }
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
const browser = new BrowserService({
  ...(config.browserCdpUrl ? { cdpUrl: config.browserCdpUrl } : {}),
  enabled: config.browserEnabled,
  ...(config.browserSurfaceUrl ? { surfaceUrl: config.browserSurfaceUrl } : {}),
});
const sshTargets = new OpenSshTargetDiscovery();
const sshBootstrap = new OpenSshBootstrap({ targets: sshTargets });
const requestHandler = createRequestHandler(
  providers,
  config.hostName,
  voiceHttp,
  hostAuth,
  browser,
  sshTargets,
  sshBootstrap
);
const voiceRealtime = new VoiceRealtimeBridge({
  baseUrl: config.voiceBaseUrl,
  credentials: voiceCredentials,
});
const browserView = new BrowserViewBridge(browser);
type HostSocketData = BrowserViewSocketData | VoiceRealtimeSocketData;
const asBrowserSocket = (socket: ServerWebSocket<HostSocketData>) =>
  socket as unknown as ServerWebSocket<BrowserViewSocketData>;
const asVoiceSocket = (socket: ServerWebSocket<HostSocketData>) =>
  socket as unknown as ServerWebSocket<VoiceRealtimeSocketData>;
const hostWebSocket: WebSocketHandler<HostSocketData> = {
  close(socket, code, reason) {
    if (socket.data.kind === "browser") {
      browserView.websocket.close?.(asBrowserSocket(socket), code, reason);
      return;
    }
    voiceRealtime.websocket.close?.(asVoiceSocket(socket), code, reason);
  },
  idleTimeout: 0,
  maxPayloadLength: 16 * 1024 * 1024,
  message(socket, message) {
    if (socket.data.kind === "browser") {
      browserView.websocket.message?.(asBrowserSocket(socket), message);
      return;
    }
    const byteLength =
      typeof message === "string"
        ? new TextEncoder().encode(message).byteLength
        : message.byteLength;
    if (byteLength > 512 * 1024) {
      socket.close(1009, "Voice message is too large");
      return;
    }
    voiceRealtime.websocket.message?.(asVoiceSocket(socket), message);
  },
  open(socket) {
    if (socket.data.kind === "browser") {
      browserView.websocket.open?.(asBrowserSocket(socket));
      return;
    }
    voiceRealtime.websocket.open?.(asVoiceSocket(socket));
  },
  perMessageDeflate: false,
};
const server = serve<HostSocketData>({
  fetch(request, bunServer) {
    const { pathname } = new URL(request.url);
    if (pathname === "/v1/voice/realtime") {
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
        return voiceRealtime.handleUpgrade(
          request,
          bunServer as unknown as Server<VoiceRealtimeSocketData>,
          {
            acceptedProtocol: credential.protocol,
            principal,
          }
        );
      }
      return voiceRealtime.handleUpgrade(
        request,
        bunServer as unknown as Server<VoiceRealtimeSocketData>
      );
    }
    if (browser.isSocketRequest(pathname)) {
      return browserView.handleUpgrade(
        request,
        bunServer as unknown as Server<BrowserViewSocketData>
      );
    }
    return requestHandler(request, bunServer);
  },
  hostname: config.hostname,
  port: config.port,
  websocket: hostWebSocket,
});
const discovery = startHostDiscovery({
  hostId: config.hostId,
  hostName: config.hostName,
  port: config.port,
});

console.info(`VibePad host listening at ${server.url}`);

let shuttingDown = false;
const shutdown = async () => {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  discovery.stop();
  server.stop(true);
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

const shutdownAndExit = () => {
  shutdown().then(
    () => process.exit(0),
    (error: unknown) => {
      console.error("VibePad host shutdown failed", error);
      process.exit(1);
    }
  );
};

process.once("SIGINT", shutdownAndExit);
process.once("SIGTERM", shutdownAndExit);
