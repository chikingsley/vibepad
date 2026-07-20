import type { VoiceCleanupModel } from "@vibepad/protocol/voice";
import { describe, expect, it } from "vitest";

import { createVoiceCatalogStore } from "./voice-catalog-store";

const model = (id: string): VoiceCleanupModel => ({
  id,
  provider: "openrouter",
});

describe("Legend voice catalog store", () => {
  it("reuses a ready host catalog", async () => {
    let loads = 0;
    const store = createVoiceCatalogStore({
      loadVoiceCleanupModels: () => {
        loads += 1;
        return Promise.resolve([model("first")]);
      },
    });

    await store.load();
    await store.load();

    expect(loads).toBe(1);
    expect(store.state$.peek()).toEqual({
      errorMessage: undefined,
      models: [model("first")],
      status: "ready",
    });
  });

  it("keeps the newest result when a refresh supersedes a request", async () => {
    const releases: Array<(models: readonly VoiceCleanupModel[]) => void> = [];
    const store = createVoiceCatalogStore({
      loadVoiceCleanupModels: () =>
        new Promise((resolve) => {
          releases.push(resolve);
        }),
    });

    const first = store.load();
    const second = store.load(true);
    releases[1]?.([model("new")]);
    await second;
    releases[0]?.([model("old")]);
    await first;

    expect(store.state$.peek()).toEqual({
      errorMessage: undefined,
      models: [model("new")],
      status: "ready",
    });
  });

  it("aborts pending work with its host runtime", () => {
    let signal: AbortSignal | undefined;
    const store = createVoiceCatalogStore({
      loadVoiceCleanupModels: async (nextSignal) => {
        signal = nextSignal;
        await new Promise(() => undefined);
        return [];
      },
    });

    store.load().catch(() => undefined);
    store.cancelPending();

    expect(signal?.aborted).toBe(true);
  });
});
