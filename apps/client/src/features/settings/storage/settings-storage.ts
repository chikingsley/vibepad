import type {
  AppSettings,
  MessageScrollCheckpoint,
} from "@vibepad/protocol/settings";
import {
  createDefaultAppSettings,
  decodeAppSettings,
  decodeMessageScrollCheckpoint,
} from "@vibepad/protocol/settings";
import Storage from "expo-sqlite/kv-store";

const settingsKey = "vibepad.settings.v1";
const checkpointKey = (sessionId: string) =>
  `vibepad.timeline-position.v1.${encodeURIComponent(sessionId)}`;

const parseJson = (value: string | null): unknown => {
  if (!value) {
    return;
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    // Invalid persisted data is treated as absent and falls back to defaults.
  }
};

export interface SettingsStorage {
  readonly readMessageCheckpoint: (
    sessionId: string
  ) => Promise<MessageScrollCheckpoint | undefined>;
  readonly readSettings: () => Promise<AppSettings>;
  readonly writeMessageCheckpoint: (
    sessionId: string,
    checkpoint: MessageScrollCheckpoint
  ) => Promise<void>;
  readonly writeSettings: (settings: AppSettings) => Promise<void>;
}

export const settingsStorage: SettingsStorage = {
  async readMessageCheckpoint(sessionId) {
    return decodeMessageScrollCheckpoint(
      parseJson(await Storage.getItem(checkpointKey(sessionId)))
    );
  },
  async readSettings() {
    const stored = parseJson(await Storage.getItem(settingsKey));
    return stored === undefined
      ? createDefaultAppSettings()
      : decodeAppSettings(stored);
  },
  async writeMessageCheckpoint(sessionId, checkpoint) {
    await Storage.setItem(checkpointKey(sessionId), JSON.stringify(checkpoint));
  },
  async writeSettings(settings) {
    await Storage.setItem(settingsKey, JSON.stringify(settings));
  },
};
