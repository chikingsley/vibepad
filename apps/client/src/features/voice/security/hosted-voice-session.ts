import { voiceRealtimeModel } from "@vibepad/protocol/voice";
import { randomUuid } from "@/lib/random-uuid";
import { canonicalDpopHtu } from "./dpop-proof";
import {
  type HostedVoiceCredentialManager,
  hostedVoiceCredentials,
} from "./hosted-voice-credentials";

export interface HostedVoiceRealtimeConnection {
  readonly headers: Readonly<Record<string, string>>;
  readonly protocols: readonly string[];
  readonly url: string;
}

type NativeWebSocketConstructor = new (
  url: string,
  protocols: string[] | null,
  options: { readonly headers: Readonly<Record<string, string>> }
) => WebSocket;

const AuthenticatedWebSocket =
  WebSocket as unknown as NativeWebSocketConstructor;

export const openHostedVoiceRealtimeSocket = (
  connection: HostedVoiceRealtimeConnection
): WebSocket =>
  new AuthenticatedWebSocket(connection.url, null, {
    headers: connection.headers,
  });

export class HostedVoiceSession {
  readonly #credentials: HostedVoiceCredentialManager;
  #nonce: string | undefined;

  constructor(credentials = hostedVoiceCredentials) {
    this.#credentials = credentials;
  }

  async fetch(path: string, init: RequestInit = {}): Promise<Response> {
    let access = await this.#credentials.access();
    const url = new URL(path, `${this.#credentials.baseUrl}/`).toString();
    const original = new Request(url, init);
    const send = async (): Promise<Response> => {
      const headers = new Headers(original.headers);
      headers.set("Authorization", `DPoP ${access.token.key}`);
      headers.set(
        "DPoP",
        await access.signer.proof({
          accessToken: access.token.key,
          htm: original.method,
          htu: original.url,
          jti: randomUuid(),
          ...(this.#nonce ? { nonce: this.#nonce } : {}),
        })
      );
      return fetch(new Request(original.clone(), { headers }));
    };

    let response = await send();
    const challengedNonce = response.headers.get("DPoP-Nonce")?.trim();
    if (response.status === 401 && challengedNonce) {
      this.#nonce = challengedNonce;
      await response.body?.cancel();
      response = await send();
    }
    if (response.status === 401) {
      await response.body?.cancel();
      await this.#credentials.invalidateToken();
      access = await this.#credentials.access();
      response = await send();
    }
    return response;
  }

  async realtimeConnection(
    model = voiceRealtimeModel
  ): Promise<HostedVoiceRealtimeConnection> {
    const preflight = await this.fetch("/health");
    if (!preflight.ok) {
      throw new Error(
        `Peacockery Voice authentication failed with status ${preflight.status}`
      );
    }
    await preflight.body?.cancel();
    if (!this.#nonce) {
      throw new Error("Peacockery Voice did not provide a DPoP nonce");
    }

    const access = await this.#credentials.access();
    const httpUrl = new URL("/v1/realtime", this.#credentials.baseUrl);
    httpUrl.searchParams.set("channels", "1");
    httpUrl.searchParams.set("dictation", "true");
    httpUrl.searchParams.set("encoding", "linear16");
    httpUrl.searchParams.set("interim_results", "true");
    httpUrl.searchParams.set("model", model);
    httpUrl.searchParams.set("punctuate", "true");
    httpUrl.searchParams.set("sample_rate", "16000");
    httpUrl.searchParams.set("target_streaming_delay_ms", "200");
    const proof = await access.signer.proof({
      accessToken: access.token.key,
      htm: "GET",
      htu: canonicalDpopHtu(httpUrl.toString()),
      jti: randomUuid(),
      nonce: this.#nonce,
    });
    const socketUrl = new URL(httpUrl);
    socketUrl.protocol = "wss:";
    return {
      headers: {
        Authorization: `DPoP ${access.token.key}`,
        DPoP: proof,
      },
      protocols: [],
      url: socketUrl.toString(),
    };
  }
}

export const hostedVoiceSession = new HostedVoiceSession();
