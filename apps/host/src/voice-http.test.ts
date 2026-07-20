import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { json as readJson } from "node:stream/consumers";
import {
  voiceCleanupModelListResponseSchema,
  voiceCleanupResponseSchema,
} from "@vibepad/protocol/voice";
import { OpenCodeAdapter } from "@vibepad/provider-opencode/adapter";
import { expect, it } from "vitest";

import type {
  HostAuthController,
  HostAuthPrincipal,
} from "./host-auth-contract";
import { createRequestHandler } from "./http";
import { VoiceCredentialService } from "./voice-credentials";
import { VoiceHttpService } from "./voice-http";

it("uses the generated Peacockery client for authenticated catalog and cleanup requests", async () => {
  const childAuthorizations: string[] = [];
  let clientMetadataHeaders: Record<string, string | undefined> = {};
  let mintAuthorization = "";
  let mintCount = 0;
  let mintRequest: unknown;
  let textRequest: unknown;
  const upstream = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://voice.fixture");
    const send = (value: unknown, status = 200) => {
      response.writeHead(status, { "Content-Type": "application/json" });
      response.end(JSON.stringify(value));
    };
    if (url.pathname === "/v1/auth/client-tokens") {
      mintAuthorization = request.headers.authorization ?? "";
      mintCount += 1;
      mintRequest = await readJson(request);
      send(
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
        201
      );
      return;
    }
    childAuthorizations.push(request.headers.authorization ?? "");
    clientMetadataHeaders = {
      appId: request.headers["x-peacockery-app-id"] as string | undefined,
      appVersion: request.headers["x-peacockery-app-version"] as
        | string
        | undefined,
      clientVersion: request.headers["x-peacockery-client-version"] as
        | string
        | undefined,
      deviceId: request.headers["x-peacockery-device-id"] as string | undefined,
      deviceModel: request.headers["x-peacockery-device-model"] as
        | string
        | undefined,
      installationId: request.headers["x-peacockery-installation-id"] as
        | string
        | undefined,
      osVersion: request.headers["x-peacockery-os-version"] as
        | string
        | undefined,
      platform: request.headers["x-peacockery-platform"] as string | undefined,
    };
    if (url.pathname === "/v1/models") {
      send({
        models: [
          {
            id: "cerebras-gpt-oss-120b",
            intelligence: {
              display_score: 7.4,
              index: 14,
              measured_at: "2026-07-19T00:00:00.000Z",
              profile: "gpt-oss-120b-low",
              source: "artificial-analysis",
              source_version: "fixture",
            },
            kind: "language",
            provider: "cerebras",
            reasoning_profile: "low",
            upstream_model: "gpt-oss-120b",
          },
          {
            id: "elevenlabs-scribe_v2",
            kind: "transcription",
            provider: "elevenlabs",
            upstream_model: "scribe_v2",
          },
        ],
        presentation_schema_version: 1,
      });
      return;
    }
    if (url.pathname === "/v1/text") {
      textRequest = await readJson(request);
      send({
        finishReason: "stop",
        model: "cerebras-gpt-oss-120b",
        outputType: "text",
        provider: "cerebras",
        providerLatencyMs: 24,
        text: "Connect the Peacockery Voice HTTP client.",
        upstreamModel: "gpt-oss-120b",
        usage: { inputTokens: 52, outputTokens: 9, totalTokens: 61 },
      });
      return;
    }
    send({ error: "not_found" }, 404);
  });
  upstream.listen(0, "127.0.0.1");
  await once(upstream, "listening");
  const address = upstream.address() as AddressInfo;
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
  const hostAuth: HostAuthController = {
    authenticateAuthorization: (authorization) =>
      authorization === "Bearer vp_fixture" ? principal : undefined,
    authenticateToken: (token) =>
      token === "vp_fixture" ? principal : undefined,
    redeem: () => {
      throw new Error("Pairing is outside this Voice route fixture");
    },
    revokeAuthorization: () => false,
  };

  try {
    const credentials = new VoiceCredentialService({
      apiKey: "fixture-parent-key",
      baseUrl: `http://127.0.0.1:${address.port}`,
      hostId: "hochi",
      hostName: "Hochi",
    });
    const voice = new VoiceHttpService({
      baseUrl: `http://127.0.0.1:${address.port}`,
      credentials,
    });
    const handler = createRequestHandler(
      new OpenCodeAdapter("http://127.0.0.1:1"),
      "voice-fixture-host",
      voice,
      hostAuth
    );
    const remoteServer = {
      requestIP: () => ({ address: "100.64.0.42" }),
      timeout: () => undefined,
    };
    const authorizationHeaders = { Authorization: "Bearer vp_fixture" };

    const modelsResponse = await handler(
      new Request("http://vibepad.test/v1/voice/models", {
        headers: authorizationHeaders,
      }),
      remoteServer
    );
    expect(modelsResponse.status).toBe(200);
    const models = voiceCleanupModelListResponseSchema.parse(
      await modelsResponse.json()
    );
    expect(models.data).toEqual([
      {
        displayScore: 7.4,
        id: "cerebras-gpt-oss-120b",
        profile: "gpt-oss-120b-low",
        provider: "cerebras",
        reasoningProfile: "low",
      },
    ]);

    const cleanupResponse = await handler(
      new Request("http://vibepad.test/v1/voice/cleanup", {
        body: JSON.stringify({
          model: "cerebras-gpt-oss-120b",
          promptProfile: "coding",
          text: "uh connect the peacockery voice HTTP client I guess",
        }),
        headers: {
          ...authorizationHeaders,
          "Content-Type": "application/json",
        },
        method: "POST",
      }),
      remoteServer
    );
    expect(cleanupResponse.status).toBe(200);
    expect(
      voiceCleanupResponseSchema.parse(await cleanupResponse.json()).data
    ).toEqual({
      finishReason: "stop",
      model: "cerebras-gpt-oss-120b",
      provider: "cerebras",
      text: "Connect the Peacockery Voice HTTP client.",
      upstreamModel: "gpt-oss-120b",
    });
    expect(mintAuthorization).toBe("Bearer fixture-parent-key");
    expect(mintCount).toBe(1);
    expect(mintRequest).toEqual({
      installation_id: "92dc9ebf-3093-43da-84b7-242006585440",
      scopes: [
        "models:read",
        "text:write",
        "transcriptions:read",
        "transcriptions:write",
      ],
      ttl_seconds: 3600,
    });
    expect(childAuthorizations).toEqual([
      "Bearer pvc_fixture-child-token",
      "Bearer pvc_fixture-child-token",
    ]);
    expect(clientMetadataHeaders).toEqual({
      appId: "studio.peacockery.vibepad",
      appVersion: "1.0.0",
      clientVersion: "1.0.0",
      deviceId: principal.deviceId,
      deviceModel: "iPad Pro 13-inch (M4)",
      installationId: "92dc9ebf-3093-43da-84b7-242006585440",
      osVersion: "26.0",
      platform: "ios",
    });
    expect(textRequest).toMatchObject({
      messages: [
        {
          content: expect.stringContaining("Do not answer or act"),
          role: "system",
        },
        {
          content: "uh connect the peacockery voice HTTP client I guess",
          role: "user",
        },
      ],
      model: "cerebras-gpt-oss-120b",
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      upstream.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
});

it("keeps Voice HTTP routes unavailable when the host has no credential", async () => {
  const credentials = new VoiceCredentialService({
    baseUrl: "https://voice-lab.peacockery.studio",
    hostId: "voice-unconfigured-host",
    hostName: "Voice unconfigured host",
  });
  const handler = createRequestHandler(
    new OpenCodeAdapter("http://127.0.0.1:1"),
    "voice-unconfigured-host",
    new VoiceHttpService({
      baseUrl: "https://voice-lab.peacockery.studio",
      credentials,
    })
  );

  const response = await handler(
    new Request("http://vibepad.test/v1/voice/models")
  );
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({
    error: "voice_not_configured",
    message: "Peacockery Voice is not configured on this host",
  });
});
