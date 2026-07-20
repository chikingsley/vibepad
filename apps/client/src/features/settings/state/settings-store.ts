import { batch, type Observable, observable } from "@legendapp/state";
import type {
  AppSettings,
  MessageScrollCheckpoint,
} from "@vibepad/protocol/settings";
import { createDefaultAppSettings } from "@vibepad/protocol/settings";

import type { SettingsStorage } from "../storage/settings-storage";

export type SettingsPersistenceState = "error" | "loading" | "ready" | "saving";

export interface SettingsStoreState {
  errorMessage: string | undefined;
  persistenceState: SettingsPersistenceState;
  settings: AppSettings;
}

export interface SettingsStore {
  readonly cancelPending: () => void;
  readonly load: () => Promise<void>;
  readonly readMessageCheckpoint: (
    sessionId: string
  ) => Promise<MessageScrollCheckpoint | undefined>;
  readonly reset: () => void;
  readonly state$: Observable<SettingsStoreState>;
  readonly update: (transform: (current: AppSettings) => AppSettings) => void;
  readonly waitForPersistence: () => Promise<void>;
  readonly writeMessageCheckpoint: (
    sessionId: string,
    checkpoint: MessageScrollCheckpoint
  ) => Promise<void>;
}

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Unable to save settings";

export function createSettingsStore(storage: SettingsStorage): SettingsStore {
  const state$ = observable<SettingsStoreState>({
    errorMessage: undefined,
    persistenceState: "loading",
    settings: createDefaultAppSettings(),
  });
  let active = true;
  let loadRevision = 0;
  let writeRevision = 0;
  let writeQueue = Promise.resolve();

  const load = async () => {
    const revision = loadRevision + 1;
    loadRevision = revision;
    if (writeRevision === 0) {
      state$.persistenceState.set("loading");
    }
    try {
      const stored = await storage.readSettings();
      if (active && loadRevision === revision && writeRevision === 0) {
        batch(() => {
          state$.errorMessage.set(undefined);
          state$.settings.set(stored);
          state$.persistenceState.set("ready");
        });
      }
    } catch (error) {
      if (active && loadRevision === revision && writeRevision === 0) {
        batch(() => {
          state$.errorMessage.set(errorMessage(error));
          state$.persistenceState.set("error");
        });
      }
    }
  };

  const persist = (next: AppSettings) => {
    const revision = writeRevision + 1;
    writeRevision = revision;
    batch(() => {
      state$.errorMessage.set(undefined);
      state$.persistenceState.set("saving");
    });
    writeQueue = writeQueue
      .catch(() => undefined)
      .then(() => storage.writeSettings(next));
    writeQueue
      .then(() => {
        if (active && writeRevision === revision) {
          state$.persistenceState.set("ready");
        }
      })
      .catch((error: unknown) => {
        if (active && writeRevision === revision) {
          batch(() => {
            state$.errorMessage.set(errorMessage(error));
            state$.persistenceState.set("error");
          });
        }
      });
  };

  const update = (transform: (current: AppSettings) => AppSettings) => {
    const current = state$.settings.peek();
    const next = transform(current);
    if (next === current) {
      return;
    }
    state$.settings.set(next);
    persist(next);
  };

  return {
    cancelPending: () => {
      active = false;
      loadRevision += 1;
    },
    load,
    readMessageCheckpoint: storage.readMessageCheckpoint,
    reset: () => {
      const next = createDefaultAppSettings();
      state$.settings.set(next);
      persist(next);
    },
    state$,
    update,
    waitForPersistence: () => writeQueue,
    writeMessageCheckpoint: storage.writeMessageCheckpoint,
  };
}
