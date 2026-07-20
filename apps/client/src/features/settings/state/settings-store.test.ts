import { createDefaultAppSettings } from "@vibepad/protocol/settings";
import { describe, expect, it } from "vitest";

import type { SettingsStorage } from "../storage/settings-storage";
import { createSettingsStore } from "./settings-store";

const createStorage = (
  overrides: Partial<SettingsStorage> = {}
): SettingsStorage => ({
  readMessageCheckpoint: async () => undefined,
  readSettings: async () => createDefaultAppSettings(),
  writeMessageCheckpoint: async () => undefined,
  writeSettings: async () => undefined,
  ...overrides,
});

describe("Legend settings store", () => {
  it("hydrates the decoded storage boundary", async () => {
    const stored = {
      ...createDefaultAppSettings(),
      timeline: { opening: "bottom" as const },
    };
    const store = createSettingsStore(
      createStorage({ readSettings: async () => stored })
    );

    await store.load();

    expect(store.state$.settings.peek()).toEqual(stored);
    expect(store.state$.persistenceState.peek()).toBe("ready");
  });

  it("updates one leaf without notifying an unrelated preference", async () => {
    const writes: unknown[] = [];
    const store = createSettingsStore(
      createStorage({
        writeSettings: (settings) => {
          writes.push(settings);
          return Promise.resolve();
        },
      })
    );
    await store.load();
    let openingNotifications = 0;
    let voiceNotifications = 0;
    const disposeOpening = store.state$.settings.timeline.opening.onChange(
      () => {
        openingNotifications += 1;
      }
    );
    const disposeVoice =
      store.state$.settings.voice.showInterimTranscript.onChange(() => {
        voiceNotifications += 1;
      });

    store.update((current) => ({
      ...current,
      timeline: { opening: "last-position" },
    }));
    await store.waitForPersistence();

    expect(openingNotifications).toBe(1);
    expect(voiceNotifications).toBe(0);
    expect(writes).toEqual([store.state$.settings.peek()]);
    disposeOpening();
    disposeVoice();
  });

  it("serializes writes and publishes only the latest completion state", async () => {
    const writes: string[] = [];
    let releaseFirst: (() => void) | undefined;
    let reportFirstStarted: (() => void) | undefined;
    const firstWrite = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const firstStarted = new Promise<void>((resolve) => {
      reportFirstStarted = resolve;
    });
    const store = createSettingsStore(
      createStorage({
        writeSettings: async (settings) => {
          writes.push(settings.timeline.opening);
          if (writes.length === 1) {
            reportFirstStarted?.();
            await firstWrite;
          }
        },
      })
    );
    await store.load();

    store.update((current) => ({
      ...current,
      timeline: { opening: "last-position" },
    }));
    store.update((current) => ({
      ...current,
      timeline: { opening: "bottom" },
    }));

    expect(writes).toEqual([]);
    expect(store.state$.persistenceState.peek()).toBe("saving");
    await firstStarted;
    expect(writes).toEqual(["last-position"]);
    releaseFirst?.();
    await store.waitForPersistence();

    expect(writes).toEqual(["last-position", "bottom"]);
    expect(store.state$.persistenceState.peek()).toBe("ready");
  });

  it("keeps a local update when an earlier storage read finishes later", async () => {
    let releaseRead:
      | ((settings: ReturnType<typeof createDefaultAppSettings>) => void)
      | undefined;
    const deferredRead = new Promise<
      ReturnType<typeof createDefaultAppSettings>
    >((resolve) => {
      releaseRead = resolve;
    });
    const store = createSettingsStore(
      createStorage({ readSettings: () => deferredRead })
    );
    const loading = store.load();

    store.update((current) => ({
      ...current,
      timeline: { opening: "bottom" },
    }));
    releaseRead?.({
      ...createDefaultAppSettings(),
      timeline: { opening: "last-position" },
    });
    await loading;

    expect(store.state$.settings.timeline.opening.peek()).toBe("bottom");
  });
});
