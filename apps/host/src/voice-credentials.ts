import { release } from "node:os";
import {
  createPeacockeryVoiceClient,
  type PeacockeryVoiceClient,
} from "@chikingsley/peacockery-voice-client";

import type { HostAuthPrincipal } from "./host-auth-contract";
import { VoiceServiceError } from "./voice-error";

const defaultTokenTtlSeconds = 3600;
const refreshSkewMs = 5 * 60 * 1000;
const childTokenScopes = [
  "models:read",
  "text:write",
  "transcriptions:read",
  "transcriptions:write",
] as const;

interface CachedVoiceToken {
  readonly apiKey: string;
  readonly expiresAtMs: number;
}

export interface VoiceAccess {
  readonly apiKey: string;
  readonly headers: Readonly<Record<string, string>>;
}

export interface VoiceCredentialServiceOptions {
  readonly apiKey?: string;
  readonly baseUrl: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly hostId: string;
  readonly hostName: string;
  readonly now?: () => number;
  readonly tokenTtlSeconds?: number;
}

const metadataHeaders = (
  principal: HostAuthPrincipal
): Readonly<Record<string, string>> => ({
  "X-Peacockery-App-ID": principal.clientMetadata.appId,
  "X-Peacockery-App-Version": principal.clientMetadata.appVersion,
  "X-Peacockery-Client-Version": principal.clientMetadata.clientVersion,
  "X-Peacockery-Device-ID": principal.deviceId,
  "X-Peacockery-Device-Model": principal.clientMetadata.deviceModel,
  "X-Peacockery-Installation-ID": principal.clientMetadata.installationId,
  "X-Peacockery-OS-Version": principal.clientMetadata.osVersion,
  "X-Peacockery-Platform": principal.clientMetadata.platform,
});

const tokenRequestFailure = (status: number) => {
  if (status === 401 || status === 403) {
    return new VoiceServiceError(
      "voice_unauthorized",
      "Peacockery Voice rejected the host's client-token minting credential",
      502
    );
  }
  return new VoiceServiceError(
    "voice_upstream_unavailable",
    `Peacockery Voice client-token request failed with status ${status}`,
    502
  );
};

export class VoiceCredentialService {
  readonly #cache = new Map<string, CachedVoiceToken>();
  readonly #fallbackPrincipal: HostAuthPrincipal;
  readonly #inflight = new Map<string, Promise<CachedVoiceToken>>();
  readonly #now: () => number;
  readonly #parentClient: PeacockeryVoiceClient | undefined;
  readonly #tokenTtlSeconds: number;

  constructor(options: VoiceCredentialServiceOptions) {
    this.#parentClient = options.apiKey
      ? createPeacockeryVoiceClient({
          apiKey: options.apiKey,
          baseUrl: options.baseUrl,
          ...(options.fetch ? { fetch: options.fetch } : {}),
        })
      : undefined;
    this.#now = options.now ?? Date.now;
    this.#tokenTtlSeconds = options.tokenTtlSeconds ?? defaultTokenTtlSeconds;
    this.#fallbackPrincipal = {
      clientMetadata: {
        appId: "studio.peacockery.vibepad.host",
        appVersion: "0.1.0",
        clientVersion: "0.1.0",
        deviceModel: options.hostName,
        installationId: options.hostId,
        osVersion: release(),
        platform: process.platform,
      },
      deviceId: options.hostId,
      deviceName: options.hostName,
    };
  }

  get configured() {
    return Boolean(this.#parentClient);
  }

  async accessFor(principal?: HostAuthPrincipal): Promise<VoiceAccess> {
    const identity = principal ?? this.#fallbackPrincipal;
    const { installationId } = identity.clientMetadata;
    const cached = this.#cache.get(installationId);
    if (cached && cached.expiresAtMs - refreshSkewMs > this.#now()) {
      return { apiKey: cached.apiKey, headers: metadataHeaders(identity) };
    }

    let tokenPromise = this.#inflight.get(installationId);
    if (!tokenPromise) {
      tokenPromise = this.#mint(identity);
      this.#inflight.set(installationId, tokenPromise);
      tokenPromise
        .finally(() => {
          this.#inflight.delete(installationId);
        })
        .catch(() => undefined);
    }
    const token = await tokenPromise;
    return { apiKey: token.apiKey, headers: metadataHeaders(identity) };
  }

  async #mint(principal: HostAuthPrincipal): Promise<CachedVoiceToken> {
    const client = this.#parentClient;
    if (!client) {
      throw new VoiceServiceError(
        "voice_not_configured",
        "Peacockery Voice is not configured on this host",
        503
      );
    }
    const { data, response } = await client.POST("/v1/auth/client-tokens", {
      body: {
        installation_id: principal.clientMetadata.installationId,
        scopes: [...childTokenScopes],
        ttl_seconds: this.#tokenTtlSeconds,
      },
      headers: metadataHeaders(principal),
    });
    if (!data) {
      throw tokenRequestFailure(response.status);
    }
    const parsedExpiry = Date.parse(data.expires_at);
    const token = {
      apiKey: data.key,
      expiresAtMs: Number.isFinite(parsedExpiry)
        ? parsedExpiry
        : this.#now() + this.#tokenTtlSeconds * 1000,
    };
    this.#cache.set(principal.clientMetadata.installationId, token);
    return token;
  }
}
