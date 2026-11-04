import { hostAuthWebSocketProtocol } from "@vibepad/protocol/auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VibePadHostClient } from "./vibepad-host";

const credentials = vi.hoisted(
  () => new Map<string, { readonly kind: "bearer"; readonly token: string }>()
);

vi.mock("@/features/connections/client-installation-profile", () => ({
  getClientInstallationMetadata: () => Promise.resolve({}),
}));

vi.mock("@/features/connections/host-credential-store", () => ({
  hostCredentialStore: {
    delete(hostId: string) {
      credentials.delete(hostId);
      return Promise.resolve();
    },
    read(hostId: string) {
      return Promise.resolve(credentials.get(hostId));
    },
    write(
      hostId: string,
      credential: { readonly kind: "bearer"; readonly token: string }
    ) {
      credentials.set(hostId, credential);
      return Promise.resolve();
    },
  },
}));

vi.mock("expo/fetch", () => ({
  fetch: globalThis.fetch,
}));

vi.mock("react-native", () => ({
  Platform: { OS: "web" },
}));

describe("VibePad host credentials", () => {
  beforeEach(() => {
    credentials.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses credentials added or removed after the client is created", async () => {
    const requestHeaders: Headers[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        requestHeaders.push(new Headers(init?.headers));
        return Promise.resolve(
          new Response(JSON.stringify({ data: [] }), {
            headers: { "Content-Type": "application/json" },
            status: 200,
          })
        );
      })
    );
    const client = new VibePadHostClient({
      baseUrl: "http://vibepad.test",
      hostId: "gmk",
    });

    expect((await client.voiceRealtimeConnection()).protocols).toEqual([]);

    credentials.set("gmk", { kind: "bearer", token: "paired-token" });
    expect((await client.voiceRealtimeConnection()).protocols).toEqual([
      hostAuthWebSocketProtocol("paired-token"),
    ]);
    await client.listFiles("project", "");
    expect(requestHeaders.at(-1)?.get("Authorization")).toBe(
      "Bearer paired-token"
    );

    credentials.delete("gmk");
    await client.listFiles("project", "");
    expect(requestHeaders.at(-1)?.has("Authorization")).toBe(false);
  });
});
