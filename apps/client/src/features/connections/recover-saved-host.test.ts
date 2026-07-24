import { createHostProfile } from "@vibepad/protocol/settings";
import { describe, expect, it, vi } from "vitest";

import { recoverSavedHost } from "./recover-saved-host";

const recoverableHost = createHostProfile({
  automaticStart: {
    enabled: true,
    recoveryKeyId: "device-key",
    ssh: { host: "hojo", port: 22, username: "simon" },
  },
  id: "hojo",
  name: "hojo",
  url: "http://hojo:4100",
});

describe("saved Host recovery", () => {
  it("uses only the saved key identifier and SSH destination", async () => {
    const recoverHostAsync = vi.fn(async () => ({ hostReady: true }));
    const fetch = vi.fn(async () => new Response(null, { status: 200 }));

    await recoverSavedHost(
      recoverableHost,
      { recoverHostAsync },
      { fetch, wait: vi.fn() }
    );

    expect(recoverHostAsync).toHaveBeenCalledWith({
      host: "hojo",
      port: 22,
      recoveryKeyId: "device-key",
      username: "simon",
    });
    expect(fetch).toHaveBeenCalledWith("http://hojo:4100/health");
  });

  it("coalesces recovery calls until the Host is healthy", async () => {
    const recoverHostAsync = vi.fn(async () => ({ hostReady: true }));
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("starting"))
      .mockResolvedValue(new Response(null, { status: 200 }));
    const wait = vi.fn(async () => undefined);

    await Promise.all([
      recoverSavedHost(recoverableHost, { recoverHostAsync }, { fetch, wait }),
      recoverSavedHost(recoverableHost, { recoverHostAsync }, { fetch, wait }),
    ]);

    expect(recoverHostAsync).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("requires a complete enabled recovery profile", async () => {
    const host = createHostProfile({
      id: "hojo",
      name: "hojo",
      url: "http://hojo:4100",
    });

    await expect(
      recoverSavedHost(host, { recoverHostAsync: vi.fn() })
    ).rejects.toThrow("Automatic startup is unavailable");
  });

  it("rejects a recovery session that never reports a ready Host", async () => {
    await expect(
      recoverSavedHost(recoverableHost, {
        recoverHostAsync: vi.fn(async () => ({ hostReady: false })),
      })
    ).rejects.toThrow("VibePad Host remains unavailable");
  });
});
