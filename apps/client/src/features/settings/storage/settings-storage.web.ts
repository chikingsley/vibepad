import {
  createDefaultAppSettings,
  decodeAppSettings,
  decodeMessageScrollCheckpoint,
} from "@vibepad/protocol/settings";

import type { SettingsStorage } from "./settings-storage";

const settingsKey = "vibepad.settings.v1";
const checkpointKey = (sessionId: string) =>
  `vibepad.timeline-position.v1.${encodeURIComponent(sessionId)}`;

const browserStorage = () =>
  typeof globalThis.localStorage === "undefined"
    ? undefined
    : globalThis.localStorage;

const readJson = (key: string): unknown => {
  try {
    const value = browserStorage()?.getItem(key);
    return value ? (JSON.parse(value) as unknown) : undefined;
  } catch {
    // Invalid or inaccessible browser data is treated as absent.
  }
};

const writeJson = (key: string, value: unknown) => {
  const storage = browserStorage();
  if (!storage) {
    throw new Error("Browser storage is unavailable");
  }
  storage.setItem(key, JSON.stringify(value));
};

export const settingsStorage: SettingsStorage = {
  readMessageCheckpoint(sessionId) {
    return Promise.resolve(
      decodeMessageScrollCheckpoint(readJson(checkpointKey(sessionId)))
    );
  },
  readSettings() {
    const stored = readJson(settingsKey);
    return Promise.resolve(
      stored === undefined
        ? createDefaultAppSettings()
        : decodeAppSettings(stored)
    );
  },
  writeMessageCheckpoint(sessionId, checkpoint) {
    writeJson(checkpointKey(sessionId), checkpoint);
    return Promise.resolve();
  },
  writeSettings(settings) {
    writeJson(settingsKey, settings);
    return Promise.resolve();
  },
};
