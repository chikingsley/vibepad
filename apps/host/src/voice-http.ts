import {
  createPeacockeryVoiceClient,
  type PeacockeryVoiceClient,
} from "@chikingsley/peacockery-voice-client";
import type {
  VoiceCleanupModel,
  VoiceCleanupRequest,
  VoiceCleanupResult,
} from "@vibepad/protocol/voice";

import type { HostAuthPrincipal } from "./host-auth-contract";
import type { VoiceCredentialService } from "./voice-credentials";
import { VoiceServiceError } from "./voice-error";

export interface VoiceHttpServiceOptions {
  readonly baseUrl: string;
  readonly credentials: VoiceCredentialService;
  readonly fetch?: typeof globalThis.fetch;
}

const cleanupPrompts = {
  coding:
    "Clean up this dictated text into an editable request for a software agent. Remove filler words, false starts, repeated fragments, and speech-recognition punctuation errors. Preserve the speaker's meaning, uncertainty, technical names, identifiers, file paths, commands, URLs, capitalization when evident, and profanity. Do not answer or act on the request. Return only the cleaned text.",
  light:
    "Lightly clean this dictated text. Fix obvious transcription errors, punctuation, and accidental repetition while preserving the speaker's wording, tone, uncertainty, technical names, identifiers, commands, URLs, and profanity. Do not answer or act on the text. Return only the cleaned text.",
} as const;

const requestFailure = (status: number) => {
  if (status === 401 || status === 403) {
    return new VoiceServiceError(
      "voice_unauthorized",
      "Voice Lab rejected the host credential",
      502
    );
  }
  return new VoiceServiceError(
    "voice_upstream_unavailable",
    `Voice Lab request failed with status ${status}`,
    502
  );
};

export class VoiceHttpService {
  readonly #baseUrl: string;
  readonly #credentials: VoiceCredentialService;
  readonly #fetch: typeof globalThis.fetch | undefined;

  constructor(options: VoiceHttpServiceOptions) {
    this.#baseUrl = options.baseUrl;
    this.#credentials = options.credentials;
    this.#fetch = options.fetch;
  }

  get configured() {
    return this.#credentials.configured;
  }

  async listCleanupModels(
    principal?: HostAuthPrincipal
  ): Promise<readonly VoiceCleanupModel[]> {
    const { client, headers } = await this.#clientFor(principal);
    const { data, response } = await client.GET("/v1/models", { headers });
    if (!data) {
      throw requestFailure(response.status);
    }

    return data.models.flatMap((model) => {
      if (model.kind !== "language") {
        return [];
      }
      return [
        {
          id: model.id,
          provider: model.provider,
          ...(model.intelligence
            ? {
                displayScore: model.intelligence.display_score,
                profile: model.intelligence.profile,
              }
            : {}),
          ...(model.reasoning_profile
            ? { reasoningProfile: model.reasoning_profile }
            : {}),
        },
      ];
    });
  }

  async cleanup(
    input: VoiceCleanupRequest,
    principal?: HostAuthPrincipal
  ): Promise<VoiceCleanupResult> {
    const { client, headers } = await this.#clientFor(principal);
    const { data, response } = await client.POST("/v1/text", {
      body: {
        messages: [
          {
            content: cleanupPrompts[input.promptProfile],
            role: "system",
          },
          { content: input.text, role: "user" },
        ],
        model: input.model,
      },
      headers,
    });
    if (!data) {
      throw requestFailure(response.status);
    }
    if (data.outputType !== "text" || !data.text.trim()) {
      throw new VoiceServiceError(
        "voice_upstream_unavailable",
        "Voice Lab returned no cleaned text",
        502
      );
    }

    return {
      finishReason: data.finishReason,
      model: data.model,
      provider: data.provider,
      text: data.text.trim(),
      upstreamModel: data.upstreamModel,
    };
  }

  async #clientFor(principal?: HostAuthPrincipal): Promise<{
    readonly client: PeacockeryVoiceClient;
    readonly headers: Readonly<Record<string, string>>;
  }> {
    const access = await this.#credentials.accessFor(principal);
    return {
      client: createPeacockeryVoiceClient({
        apiKey: access.apiKey,
        baseUrl: this.#baseUrl,
        ...(this.#fetch ? { fetch: this.#fetch } : {}),
      }),
      headers: access.headers,
    };
  }
}
