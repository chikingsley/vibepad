import {
  hostAuthWebSocketProtocol,
  type PairedHost,
  type PairHostRequest,
  pairHostPath,
  pairHostResponseSchema,
  revokeHostPath,
  revokeHostResponseSchema,
} from "@vibepad/protocol/auth";
import {
  type BrowserState,
  type BrowserTarget,
  type BrowserTargetActionRequest,
  type BrowserViewSession,
  browserPath,
  browserStateResponseSchema,
  browserTargetActionPath,
  browserTargetActionResponseSchema,
  browserTargetPath,
  browserTargetResponseSchema,
  browserTargetsPath,
  browserViewSessionResponseSchema,
  browserViewSessionsPath,
  closeBrowserTargetResponseSchema,
} from "@vibepad/protocol/browser";
import type { ProviderManifest } from "@vibepad/protocol/capabilities";
import type {
  ModelReference,
  ProviderCatalog,
} from "@vibepad/protocol/catalog";
import {
  type ProviderEvent,
  providerEventSchema,
} from "@vibepad/protocol/events";
import type {
  WorkspaceFileChange,
  WorkspaceFileContent,
  WorkspaceFileNode,
} from "@vibepad/protocol/files";
import type {
  PendingInteraction,
  PermissionDecision,
  RespondQuestionInput,
} from "@vibepad/protocol/interactions";
import type {
  ProjectSummary,
  ServiceSummary,
  SessionBootstrap,
  SessionSummary,
} from "@vibepad/protocol/provider";
import type { TimelinePage } from "@vibepad/protocol/timeline";
import {
  archiveSessionResponseSchema,
  fileChangeListResponseSchema,
  fileContentResponseSchema,
  fileListResponseSchema,
  type HostHealthResponse,
  hostHealthResponseSchema,
  interactionListResponseSchema,
  interactionResponseSchema,
  interruptTurnResponseSchema,
  projectListResponseSchema,
  providerCatalogResponseSchema,
  providerListResponseSchema,
  serviceListResponseSchema,
  sessionBootstrapResponseSchema,
  sessionListResponseSchema,
  sessionResponseSchema,
  timelineResponseSchema,
} from "@vibepad/protocol/transport";
import {
  type VoiceCleanupModel,
  type VoiceCleanupRequest,
  type VoiceCleanupResult,
  voiceCleanupModelListResponseSchema,
  voiceCleanupModelsPath,
  voiceCleanupPath,
  voiceCleanupResponseSchema,
  voiceRealtimePath,
} from "@vibepad/protocol/voice";
import { fetch as expoFetch } from "expo/fetch";
import { Platform } from "react-native";

import { getClientInstallationMetadata } from "@/features/connections/client-installation-profile";
import { hostCredentialStore } from "@/features/connections/host-credential-store";
import { VibePadHostTransport } from "./vibepad-host-transport";

const trailingSlash = /\/$/;
const defaultBaseUrl =
  // biome-ignore lint/complexity/useLiteralKeys: strict index-signature access is required by the shared TypeScript config.
  process.env["EXPO_PUBLIC_VIBEPAD_HOST_URL"] ?? "http://127.0.0.1:4100";
const defaultHostId =
  // biome-ignore lint/complexity/useLiteralKeys: strict index-signature access is required by the shared TypeScript config.
  process.env["EXPO_PUBLIC_VIBEPAD_HOST_ID"] ?? "local";
const streamingFetch =
  Platform.OS === "web"
    ? globalThis.fetch
    : (expoFetch as unknown as typeof globalThis.fetch);

export interface WorkspaceSnapshot {
  readonly health: HostHealthResponse;
  readonly projects: readonly ProjectSummary[];
  readonly providers: readonly ProviderManifest[];
  readonly sessions: readonly SessionSummary[];
}

export interface VibePadHostConnection {
  readonly baseUrl: string;
  readonly hostId: string;
}

export interface PairVibePadHostInput {
  readonly code: string;
  readonly deviceName: string;
}

export interface BrowserViewConnection extends BrowserViewSession {
  readonly url: string;
}

export const defaultVibePadHostConnection: VibePadHostConnection = {
  baseUrl: defaultBaseUrl,
  hostId: defaultHostId,
};

export class VibePadHostClient {
  readonly #transport: VibePadHostTransport;

  constructor(connection = defaultVibePadHostConnection) {
    this.#transport = new VibePadHostTransport(
      connection.baseUrl.replace(trailingSlash, ""),
      connection.hostId
    );
  }

  get baseUrl() {
    return this.#transport.baseUrl;
  }

  get hostId() {
    return this.#transport.hostId;
  }

  async voiceRealtimeConnection(): Promise<{
    readonly protocols: readonly string[];
    readonly url: string;
  }> {
    const url = new URL(voiceRealtimePath, `${this.#transport.baseUrl}/`);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const credential = await hostCredentialStore.read(this.#transport.hostId);
    return {
      protocols:
        credential?.kind === "bearer"
          ? [hostAuthWebSocketProtocol(credential.token)]
          : [],
      url: url.toString(),
    };
  }

  async pair(
    baseUrl: string,
    input: PairVibePadHostInput
  ): Promise<PairedHost> {
    const normalizedBaseUrl = baseUrl.replace(trailingSlash, "");
    const request: PairHostRequest = {
      ...input,
      clientMetadata: await getClientInstallationMetadata(),
    };
    const response = await fetch(`${normalizedBaseUrl}${pairHostPath}`, {
      body: JSON.stringify(request),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    if (!response.ok) {
      const message = await response.text();
      throw new Error(
        `VibePad host ${response.status}: ${message || response.statusText}`
      );
    }
    const paired = pairHostResponseSchema.parse(await response.json()).data;
    await hostCredentialStore.write(paired.hostId, {
      kind: "bearer",
      token: paired.token,
    });
    return paired;
  }

  async revoke(): Promise<void> {
    const response = await this.#write("DELETE", revokeHostPath);
    revokeHostResponseSchema.parse(response);
    await hostCredentialStore.delete(this.#transport.hostId);
  }

  async loadWorkspace(signal?: AbortSignal): Promise<WorkspaceSnapshot> {
    const [health, providers, projects, sessions] = await Promise.all([
      this.#get("/health", signal),
      this.#get("/v1/providers", signal),
      this.#get("/v1/projects", signal),
      this.#get("/v1/sessions", signal),
    ]);

    return {
      health: hostHealthResponseSchema.parse(health),
      projects: projectListResponseSchema.parse(projects).data,
      providers: providerListResponseSchema.parse(providers).data,
      sessions: sessionListResponseSchema.parse(sessions).data,
    };
  }

  async loadBrowser(signal?: AbortSignal): Promise<BrowserState> {
    const response = await this.#get(browserPath, signal);
    return browserStateResponseSchema.parse(response).data;
  }

  async createBrowserViewSession(): Promise<BrowserViewConnection> {
    const response = await this.#post(browserViewSessionsPath, {});
    const session = browserViewSessionResponseSchema.parse(response).data;
    return {
      ...session,
      url: new URL(session.path, `${this.#transport.baseUrl}/`).toString(),
    };
  }

  async createBrowserTarget(url: string): Promise<BrowserTarget> {
    const response = await this.#post(browserTargetsPath, { url });
    return browserTargetResponseSchema.parse(response).data;
  }

  async performBrowserTargetAction(
    targetId: string,
    action: BrowserTargetActionRequest
  ): Promise<void> {
    const response = await this.#post(
      browserTargetActionPath(targetId),
      action
    );
    browserTargetActionResponseSchema.parse(response);
  }

  async closeBrowserTarget(targetId: string): Promise<void> {
    const response = await this.#write("DELETE", browserTargetPath(targetId));
    closeBrowserTargetResponseSchema.parse(response);
  }

  async listServices(
    projectId: string,
    signal?: AbortSignal
  ): Promise<readonly ServiceSummary[]> {
    const response = await this.#get(
      `/v1/projects/${encodeURIComponent(projectId)}/services`,
      signal
    );
    return serviceListResponseSchema.parse(response).data;
  }

  async loadCatalog(
    projectId: string,
    signal?: AbortSignal
  ): Promise<ProviderCatalog> {
    const response = await this.#get(
      `/v1/projects/${encodeURIComponent(projectId)}/catalog`,
      signal
    );
    return providerCatalogResponseSchema.parse(response).data;
  }

  async loadVoiceCleanupModels(
    signal?: AbortSignal
  ): Promise<readonly VoiceCleanupModel[]> {
    const response = await this.#get(voiceCleanupModelsPath, signal);
    return voiceCleanupModelListResponseSchema.parse(response).data;
  }

  async cleanupVoiceText(
    input: VoiceCleanupRequest
  ): Promise<VoiceCleanupResult> {
    const response = await this.#post(voiceCleanupPath, input);
    return voiceCleanupResponseSchema.parse(response).data;
  }

  async listFiles(
    projectId: string,
    path: string,
    signal?: AbortSignal
  ): Promise<readonly WorkspaceFileNode[]> {
    const response = await this.#get(
      `/v1/projects/${encodeURIComponent(projectId)}/files?path=${encodeURIComponent(path)}`,
      signal
    );
    return fileListResponseSchema.parse(response).data;
  }

  async readFile(
    projectId: string,
    path: string,
    signal?: AbortSignal
  ): Promise<WorkspaceFileContent> {
    const response = await this.#get(
      `/v1/projects/${encodeURIComponent(projectId)}/files/content?path=${encodeURIComponent(path)}`,
      signal
    );
    return fileContentResponseSchema.parse(response).data;
  }

  async listFileChanges(
    projectId: string,
    signal?: AbortSignal
  ): Promise<readonly WorkspaceFileChange[]> {
    const response = await this.#get(
      `/v1/projects/${encodeURIComponent(projectId)}/changes`,
      signal
    );
    return fileChangeListResponseSchema.parse(response).data;
  }

  async createSession(projectId: string): Promise<SessionSummary> {
    const response = await this.#post("/v1/sessions", { projectId });
    return sessionResponseSchema.parse(response).data;
  }

  async archiveSession(sessionId: string): Promise<void> {
    const response = await this.#post(
      `/v1/sessions/${encodeURIComponent(sessionId)}/archive`,
      {}
    );
    archiveSessionResponseSchema.parse(response);
  }

  async loadTimeline(
    sessionId: string,
    signal?: AbortSignal,
    olderCursor?: string
  ): Promise<TimelinePage> {
    const query = olderCursor
      ? `?olderCursor=${encodeURIComponent(olderCursor)}`
      : "";
    const response = await this.#get(
      `/v1/sessions/${encodeURIComponent(sessionId)}/timeline${query}`,
      signal
    );
    return timelineResponseSchema.parse(response).data;
  }

  async bootstrapSession(
    sessionId: string,
    signal?: AbortSignal
  ): Promise<SessionBootstrap> {
    const response = await this.#get(
      `/v1/sessions/${encodeURIComponent(sessionId)}/bootstrap`,
      signal
    );
    return sessionBootstrapResponseSchema.parse(response).data;
  }

  async sendTurn(sessionId: string, text: string): Promise<void> {
    await this.#post(`/v1/sessions/${encodeURIComponent(sessionId)}/turns`, {
      text,
    });
  }

  async interruptTurn(sessionId: string): Promise<void> {
    const response = await this.#post(
      `/v1/sessions/${encodeURIComponent(sessionId)}/turns/interrupt`,
      {}
    );
    interruptTurnResponseSchema.parse(response);
  }

  async listInteractions(
    sessionId: string,
    signal?: AbortSignal
  ): Promise<readonly PendingInteraction[]> {
    const response = await this.#get(
      `/v1/sessions/${encodeURIComponent(sessionId)}/interactions`,
      signal
    );
    return interactionListResponseSchema.parse(response).data;
  }

  async respondPermission(
    sessionId: string,
    requestId: string,
    decision: PermissionDecision
  ): Promise<void> {
    const response = await this.#post(
      `/v1/sessions/${encodeURIComponent(sessionId)}/permissions/${encodeURIComponent(requestId)}/reply`,
      { decision }
    );
    interactionResponseSchema.parse(response);
  }

  async respondQuestion(input: RespondQuestionInput): Promise<void> {
    const response = await this.#post(
      `/v1/sessions/${encodeURIComponent(input.sessionId)}/questions/${encodeURIComponent(input.requestId)}/reply`,
      input.action === "answer"
        ? { action: "answer", answers: input.answers }
        : { action: "reject" }
    );
    interactionResponseSchema.parse(response);
  }

  async selectModel(
    sessionId: string,
    model: ModelReference
  ): Promise<SessionSummary> {
    const response = await this.#post(
      `/v1/sessions/${encodeURIComponent(sessionId)}/model`,
      model
    );
    return sessionResponseSchema.parse(response).data;
  }

  async selectAgent(
    sessionId: string,
    agentId: string
  ): Promise<SessionSummary> {
    const response = await this.#post(
      `/v1/sessions/${encodeURIComponent(sessionId)}/agent`,
      { agentId }
    );
    return sessionResponseSchema.parse(response).data;
  }

  async renameSession(
    sessionId: string,
    title: string
  ): Promise<SessionSummary> {
    const response = await this.#write(
      "PATCH",
      `/v1/sessions/${encodeURIComponent(sessionId)}`,
      { title }
    );
    return sessionResponseSchema.parse(response).data;
  }

  async *subscribeSessionEvents(
    sessionId: string,
    signal: AbortSignal,
    afterCursor?: string
  ): AsyncIterable<ProviderEvent> {
    const after = afterCursor
      ? `?after=${encodeURIComponent(afterCursor)}`
      : "";
    const response = await streamingFetch(
      `${this.#transport.baseUrl}/v1/sessions/${encodeURIComponent(sessionId)}/events${after}`,
      { headers: await this.#transport.authorizationHeaders(), signal }
    );
    if (!response.ok) {
      const message = await response.text();
      throw new Error(
        `VibePad host ${response.status}: ${message || response.statusText}`
      );
    }
    if (!response.body) {
      throw new Error("VibePad host event stream has no response body");
    }

    const decoder = new TextDecoder();
    const reader = response.body.getReader();
    let buffer = "";

    while (!signal.aborted) {
      // biome-ignore lint/performance/noAwaitInLoops: Stream chunks must be decoded sequentially.
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim()) {
          yield providerEventSchema.parse(JSON.parse(line) as unknown);
        }
      }
      if (done) {
        if (buffer.trim()) {
          yield providerEventSchema.parse(JSON.parse(buffer) as unknown);
        }
        return;
      }
    }
  }

  #get(path: string, signal?: AbortSignal): Promise<unknown> {
    return this.#transport.get(path, signal);
  }

  #post(path: string, body: unknown): Promise<unknown> {
    return this.#transport.post(path, body);
  }

  #write(
    method: "DELETE" | "PATCH" | "POST",
    path: string,
    body?: unknown
  ): Promise<unknown> {
    return this.#transport.write(method, path, body);
  }
}
