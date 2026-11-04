import {
  pairHostPath,
  pairHostRequestSchema,
  revokeHostPath,
} from "@vibepad/protocol/auth";
import type { HarnessAdapter } from "@vibepad/protocol/provider";
import {
  sshBootstrapPath,
  sshBootstrapRequestSchema,
  sshTargetsPath,
} from "@vibepad/protocol/remote";
import {
  createSessionRequestSchema,
  permissionReplyRequestSchema,
  questionReplyRequestSchema,
  renameSessionRequestSchema,
  selectAgentRequestSchema,
  selectModelRequestSchema,
  sendTurnRequestSchema,
} from "@vibepad/protocol/transport";
import {
  voiceCleanupModelsPath,
  voiceCleanupPath,
  voiceCleanupRequestSchema,
} from "@vibepad/protocol/voice";
import { ZodError } from "zod";
import { type BrowserService, BrowserServiceError } from "./browser-service";
import {
  type HostAuthController,
  HostAuthError,
  type HostAuthPrincipal,
  isTrustedLocalRequest,
} from "./host-auth-contract";
import type { ProviderRouter } from "./provider-router";
import type { SshBootstrap } from "./ssh-bootstrap";
import type { SshTargetDiscovery } from "./ssh-target-discovery";
import { VoiceServiceError } from "./voice-error";
import type { VoiceHttpService } from "./voice-http";

const corsHeaders = {
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "DELETE, GET, OPTIONS, PATCH, POST",
  "Access-Control-Allow-Origin": "*",
} as const;

const projectSessionsPath = /^\/v1\/projects\/(?<projectId>[^/]+)\/sessions$/u;
const projectServicesPath = /^\/v1\/projects\/(?<projectId>[^/]+)\/services$/u;
const projectFilesPath = /^\/v1\/projects\/(?<projectId>[^/]+)\/files$/u;
const projectFileContentPath =
  /^\/v1\/projects\/(?<projectId>[^/]+)\/files\/content$/u;
const projectChangesPath = /^\/v1\/projects\/(?<projectId>[^/]+)\/changes$/u;
const projectCatalogPath = /^\/v1\/projects\/(?<projectId>[^/]+)\/catalog$/u;
const sessionTimelinePath = /^\/v1\/sessions\/(?<sessionId>[^/]+)\/timeline$/u;
const sessionBootstrapPath =
  /^\/v1\/sessions\/(?<sessionId>[^/]+)\/bootstrap$/u;
const sessionEventsPath = /^\/v1\/sessions\/(?<sessionId>[^/]+)\/events$/u;
const sessionArchivePath = /^\/v1\/sessions\/(?<sessionId>[^/]+)\/archive$/u;
const sessionPath = /^\/v1\/sessions\/(?<sessionId>[^/]+)$/u;
const sessionTurnsPath = /^\/v1\/sessions\/(?<sessionId>[^/]+)\/turns$/u;
const sessionTurnInterruptPath =
  /^\/v1\/sessions\/(?<sessionId>[^/]+)\/turns\/interrupt$/u;
const sessionInteractionsPath =
  /^\/v1\/sessions\/(?<sessionId>[^/]+)\/interactions$/u;
const sessionPermissionReplyPath =
  /^\/v1\/sessions\/(?<sessionId>[^/]+)\/permissions\/(?<requestId>[^/]+)\/reply$/u;
const sessionQuestionReplyPath =
  /^\/v1\/sessions\/(?<sessionId>[^/]+)\/questions\/(?<requestId>[^/]+)\/reply$/u;
const sessionModelPath = /^\/v1\/sessions\/(?<sessionId>[^/]+)\/model$/u;
const sessionAgentPath = /^\/v1\/sessions\/(?<sessionId>[^/]+)\/agent$/u;

interface RequestTimeoutController {
  requestIP?: (
    request: Request
  ) => { readonly address: string } | null | undefined;
  timeout: (request: Request, seconds: number) => void;
}

const json = (value: unknown, status = 200) =>
  Response.json(value, {
    headers: corsHeaders,
    status,
  });

const withCors = (response: Response) => {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(corsHeaders)) {
    headers.set(name, value);
  }
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
};

const hostHealth = async (
  adapter: HarnessAdapter | ProviderRouter,
  hostName: string
) => {
  const providers =
    "providerHealth" in adapter
      ? await adapter.providerHealth()
      : [{ id: adapter.manifest.id, ...(await adapter.health()) }];
  return json({
    host: { healthy: true, id: hostName },
    provider: {
      healthy: providers.some((provider) => provider.healthy),
      version: providers
        .map((provider) => `${provider.id}:${provider.version ?? "unknown"}`)
        .join(", "),
    },
    providers,
  });
};

const handleHostGet = async (
  adapter: HarnessAdapter | ProviderRouter,
  hostName: string,
  url: URL,
  sshTargets?: SshTargetDiscovery
): Promise<Response | undefined> => {
  if (url.pathname === "/health") {
    return hostHealth(adapter, hostName);
  }
  if (url.pathname === "/v1/providers") {
    return json({
      data: "manifests" in adapter ? adapter.manifests : [adapter.manifest],
    });
  }
  if (url.pathname === sshTargetsPath) {
    return json({ data: (await sshTargets?.listTargets()) ?? [] });
  }
};

const handleGet = async (
  adapter: HarnessAdapter | ProviderRouter,
  hostName: string,
  url: URL,
  sshTargets?: SshTargetDiscovery
) => {
  const hostResponse = await handleHostGet(adapter, hostName, url, sshTargets);
  if (hostResponse) {
    return hostResponse;
  }

  if (url.pathname === "/v1/projects") {
    return json({ data: await adapter.listProjects() });
  }

  if (url.pathname === "/v1/sessions") {
    return json({ data: await adapter.listSessions() });
  }

  const fileContentMatch = projectFileContentPath.exec(url.pathname);
  const fileContentProjectId = fileContentMatch?.[1];
  if (fileContentProjectId) {
    const path = url.searchParams.get("path");
    if (!path) {
      return json({ error: "file_path_required" }, 400);
    }
    return json({
      data: await adapter.readFile({
        path,
        projectId: decodeURIComponent(fileContentProjectId),
      }),
    });
  }

  const filesMatch = projectFilesPath.exec(url.pathname);
  const filesProjectId = filesMatch?.[1];
  if (filesProjectId) {
    return json({
      data: await adapter.listFiles({
        path: url.searchParams.get("path") ?? "",
        projectId: decodeURIComponent(filesProjectId),
      }),
    });
  }

  const changesMatch = projectChangesPath.exec(url.pathname);
  const changesProjectId = changesMatch?.[1];
  if (changesProjectId) {
    return json({
      data: await adapter.listFileChanges(decodeURIComponent(changesProjectId)),
    });
  }

  const catalogMatch = projectCatalogPath.exec(url.pathname);
  const catalogProjectId = catalogMatch?.[1];
  if (catalogProjectId) {
    return json({
      data: await adapter.listCatalog(decodeURIComponent(catalogProjectId)),
    });
  }

  const timelineMatch = sessionTimelinePath.exec(url.pathname);
  const timelineSessionId = timelineMatch?.[1];
  if (timelineSessionId) {
    const cursor = url.searchParams.get("olderCursor") ?? undefined;
    return json({
      data: await adapter.listTimeline(
        decodeURIComponent(timelineSessionId),
        cursor
      ),
    });
  }

  const bootstrapMatch = sessionBootstrapPath.exec(url.pathname);
  const bootstrapSessionId = bootstrapMatch?.[1];
  if (bootstrapSessionId) {
    return json({
      data: await adapter.bootstrapSession(
        decodeURIComponent(bootstrapSessionId)
      ),
    });
  }

  const interactionsMatch = sessionInteractionsPath.exec(url.pathname);
  const interactionsSessionId = interactionsMatch?.[1];
  if (interactionsSessionId) {
    return json({
      data: await adapter.listInteractions(
        decodeURIComponent(interactionsSessionId)
      ),
    });
  }

  const sessionMatch = projectSessionsPath.exec(url.pathname);
  const projectId = sessionMatch?.[1];
  if (projectId) {
    return json({
      data: await adapter.listSessions(decodeURIComponent(projectId)),
    });
  }

  const servicesMatch = projectServicesPath.exec(url.pathname);
  const servicesProjectId = servicesMatch?.[1];
  if (servicesProjectId) {
    return json({
      data: await adapter.listServices(decodeURIComponent(servicesProjectId)),
    });
  }

  return json({ error: "not_found" }, 404);
};

const handlePost = async (
  adapter: HarnessAdapter,
  request: Request,
  url: URL
) => {
  if (url.pathname === "/v1/sessions") {
    const input = createSessionRequestSchema.parse(await request.json());
    return json(
      { data: await adapter.createSession({ projectId: input.projectId }) },
      201
    );
  }

  const archiveMatch = sessionArchivePath.exec(url.pathname);
  const archiveSessionId = archiveMatch?.[1];
  if (archiveSessionId) {
    await adapter.archiveSession({
      sessionId: decodeURIComponent(archiveSessionId),
    });
    return json({ archived: true });
  }

  const turnsMatch = sessionTurnsPath.exec(url.pathname);
  const turnsSessionId = turnsMatch?.[1];
  if (turnsSessionId) {
    const input = sendTurnRequestSchema.parse(await request.json());
    await adapter.sendTurn({
      sessionId: decodeURIComponent(turnsSessionId),
      text: input.text,
    });
    return json({ accepted: true }, 202);
  }

  const interruptMatch = sessionTurnInterruptPath.exec(url.pathname);
  const interruptSessionId = interruptMatch?.[1];
  if (interruptSessionId) {
    await adapter.abortTurn(decodeURIComponent(interruptSessionId));
    return json({ interrupted: true }, 202);
  }

  const permissionMatch = sessionPermissionReplyPath.exec(url.pathname);
  const permissionSessionId = permissionMatch?.[1];
  const permissionRequestId = permissionMatch?.[2];
  if (permissionSessionId && permissionRequestId) {
    const input = permissionReplyRequestSchema.parse(await request.json());
    await adapter.respondPermission({
      decision: input.decision,
      ...(input.message ? { message: input.message } : {}),
      requestId: decodeURIComponent(permissionRequestId),
      sessionId: decodeURIComponent(permissionSessionId),
    });
    return json({ resolved: true });
  }

  const questionMatch = sessionQuestionReplyPath.exec(url.pathname);
  const questionSessionId = questionMatch?.[1];
  const questionRequestId = questionMatch?.[2];
  if (questionSessionId && questionRequestId) {
    const input = questionReplyRequestSchema.parse(await request.json());
    await adapter.respondQuestion({
      ...input,
      requestId: decodeURIComponent(questionRequestId),
      sessionId: decodeURIComponent(questionSessionId),
    });
    return json({ resolved: true });
  }

  const modelMatch = sessionModelPath.exec(url.pathname);
  const modelSessionId = modelMatch?.[1];
  if (modelSessionId) {
    const input = selectModelRequestSchema.parse(await request.json());
    return json({
      data: await adapter.selectModel({
        ...input,
        sessionId: decodeURIComponent(modelSessionId),
      }),
    });
  }

  const agentMatch = sessionAgentPath.exec(url.pathname);
  const agentSessionId = agentMatch?.[1];
  if (agentSessionId) {
    const input = selectAgentRequestSchema.parse(await request.json());
    return json({
      data: await adapter.selectAgent({
        agentId: input.agentId,
        sessionId: decodeURIComponent(agentSessionId),
      }),
    });
  }

  return json({ error: "not_found" }, 404);
};

const handlePatch = async (
  adapter: HarnessAdapter,
  request: Request,
  url: URL
) => {
  const sessionMatch = sessionPath.exec(url.pathname);
  const sessionId = sessionMatch?.[1];
  if (!sessionId) {
    return json({ error: "not_found" }, 404);
  }

  const input = renameSessionRequestSchema.parse(await request.json());
  return json({
    data: await adapter.renameSession({
      sessionId: decodeURIComponent(sessionId),
      title: input.title,
    }),
  });
};

const streamSessionEvents = (
  adapter: HarnessAdapter,
  request: Request,
  sessionId: string,
  afterCursor?: string
) => {
  const encoder = new TextEncoder();
  const streamAbort = new AbortController();
  const abortStream = () => {
    streamAbort.abort();
  };
  request.signal.addEventListener("abort", abortStream, { once: true });

  const stream = new ReadableStream<Uint8Array>({
    cancel: abortStream,
    start(controller) {
      const run = async () => {
        try {
          for await (const event of adapter.subscribe(
            sessionId,
            streamAbort.signal,
            afterCursor
          )) {
            if (streamAbort.signal.aborted) {
              break;
            }
            controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          }
          controller.close();
        } catch (error) {
          if (!streamAbort.signal.aborted) {
            controller.error(error);
          }
        } finally {
          request.signal.removeEventListener("abort", abortStream);
        }
      };
      run().catch((error: unknown) => {
        if (!streamAbort.signal.aborted) {
          controller.error(error);
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      "Cache-Control": "no-cache, no-transform",
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
};

const handleVoiceHttp = async (
  request: Request,
  url: URL,
  voiceHttp?: VoiceHttpService,
  principal?: HostAuthPrincipal
): Promise<Response | undefined> => {
  const isModelRequest =
    request.method === "GET" && url.pathname === voiceCleanupModelsPath;
  const isCleanupRequest =
    request.method === "POST" && url.pathname === voiceCleanupPath;
  if (!(isModelRequest || isCleanupRequest)) {
    return;
  }
  if (!voiceHttp) {
    return json(
      {
        error: "voice_not_configured",
        message: "Peacockery Voice is not configured on this host",
      },
      503
    );
  }
  if (isModelRequest) {
    return json({ data: await voiceHttp.listCleanupModels(principal) });
  }
  const input = voiceCleanupRequestSchema.parse(await request.json());
  return json({ data: await voiceHttp.cleanup(input, principal) });
};

const handleHostAuthRequest = async (
  request: Request,
  url: URL,
  server?: RequestTimeoutController,
  hostAuth?: HostAuthController,
  browser?: BrowserService
): Promise<Response | undefined> => {
  if (request.method === "POST" && url.pathname === pairHostPath) {
    if (!hostAuth) {
      throw new HostAuthError(
        "host_auth_unavailable",
        "Host pairing is not configured",
        503
      );
    }
    const input = pairHostRequestSchema.parse(await request.json());
    return json(
      { data: hostAuth.redeem(input, server?.requestIP?.(request)?.address) },
      201
    );
  }
  if (request.method === "DELETE" && url.pathname === revokeHostPath) {
    const authorization = request.headers.get("authorization");
    const principal = hostAuth?.authenticateAuthorization(authorization);
    if (!(principal && hostAuth?.revokeAuthorization(authorization))) {
      throw new HostAuthError(
        "unauthorized",
        "A valid paired-device credential is required",
        401
      );
    }
    browser?.revokeDevice(principal.deviceId);
    return json({ revoked: true });
  }
};

const authorizeRemoteRequest = (
  request: Request,
  url: URL,
  server?: RequestTimeoutController,
  hostAuth?: HostAuthController
): HostAuthPrincipal | Response | undefined => {
  if (url.pathname === "/health" || url.pathname === pairHostPath) {
    return;
  }
  const address = server?.requestIP?.(request)?.address;
  if (isTrustedLocalRequest(address, request.headers.get("origin"))) {
    return;
  }
  if (!hostAuth) {
    return json(
      {
        error: "host_auth_unavailable",
        message: "Host authentication is not configured",
      },
      503
    );
  }
  const principal = hostAuth.authenticateAuthorization(
    request.headers.get("authorization")
  );
  if (!principal) {
    return json(
      {
        error: "unauthorized",
        message: "Pair this device with the VibePad host",
      },
      401
    );
  }
  return principal;
};

const routeRequest = async (
  adapter: HarnessAdapter,
  hostName: string,
  request: Request,
  server?: RequestTimeoutController,
  voiceHttp?: VoiceHttpService,
  hostAuth?: HostAuthController,
  browser?: BrowserService,
  sshTargets?: SshTargetDiscovery,
  sshBootstrap?: SshBootstrap
) => {
  const url = new URL(request.url);
  if (browser?.isViewAssetRequest(url.pathname)) {
    return browser.handleViewAsset(request, url);
  }
  const hostAuthResponse = await handleHostAuthRequest(
    request,
    url,
    server,
    hostAuth,
    browser
  );
  if (hostAuthResponse) {
    return hostAuthResponse;
  }
  const authorization = authorizeRemoteRequest(request, url, server, hostAuth);
  if (authorization instanceof Response) {
    return authorization;
  }
  const browserResponse = await browser?.handleAuthorizedHttp(
    request,
    url,
    authorization
  );
  if (browserResponse) {
    return withCors(browserResponse);
  }
  const voiceResponse = await handleVoiceHttp(
    request,
    url,
    voiceHttp,
    authorization
  );
  if (voiceResponse) {
    return voiceResponse;
  }
  if (request.method === "GET") {
    const eventsMatch = sessionEventsPath.exec(url.pathname);
    const eventsSessionId = eventsMatch?.[1];
    if (eventsSessionId) {
      server?.timeout(request, 0);
      return streamSessionEvents(
        adapter,
        request,
        decodeURIComponent(eventsSessionId),
        url.searchParams.get("after") ?? undefined
      );
    }
    return handleGet(adapter, hostName, url, sshTargets);
  }
  if (request.method === "POST") {
    if (url.pathname === sshBootstrapPath) {
      if (!sshBootstrap) {
        return json(
          {
            error: "ssh_bootstrap_unavailable",
            message: "SSH bootstrap is unavailable on this controller",
          },
          503
        );
      }
      const input = sshBootstrapRequestSchema.parse(await request.json());
      return json({ data: await sshBootstrap.installAndStart(input.alias) });
    }
    return handlePost(adapter, request, url);
  }
  if (request.method === "PATCH") {
    return handlePatch(adapter, request, url);
  }
  return json({ error: "method_not_allowed" }, 405);
};

const requestErrorResponse = (error: unknown) => {
  if (error instanceof HostAuthError) {
    return Response.json(
      { error: error.code, message: error.message },
      {
        headers: {
          ...corsHeaders,
          ...(error.retryAfterSeconds
            ? { "Retry-After": String(error.retryAfterSeconds) }
            : {}),
        },
        status: error.status,
      }
    );
  }
  if (error instanceof VoiceServiceError) {
    return json({ error: error.code, message: error.message }, error.status);
  }
  if (error instanceof BrowserServiceError) {
    return json({ error: error.code, message: error.message }, error.status);
  }
  if (error instanceof ZodError) {
    return json(
      {
        error: "invalid_request",
        issues: error.issues,
        message: "Request validation failed",
      },
      400
    );
  }
  const message = error instanceof Error ? error.message : "Unknown host error";
  return json({ error: "upstream_unavailable", message }, 503);
};

export const createRequestHandler =
  (
    adapter: HarnessAdapter,
    hostName: string,
    voiceHttp?: VoiceHttpService,
    hostAuth?: HostAuthController,
    browser?: BrowserService,
    sshTargets?: SshTargetDiscovery,
    sshBootstrap?: SshBootstrap
  ) =>
  async (request: Request, server?: RequestTimeoutController) => {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders, status: 204 });
    }

    try {
      return await routeRequest(
        adapter,
        hostName,
        request,
        server,
        voiceHttp,
        hostAuth,
        browser,
        sshTargets,
        sshBootstrap
      );
    } catch (error) {
      return requestErrorResponse(error);
    }
  };
