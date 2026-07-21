import {
  decodeWorkspaceUiSnapshot,
  type WorkspaceUiSnapshot,
} from "@/features/workspace/state/workspace-ui-persistence";

import type { WorkspaceUiStorage } from "./workspace-ui-storage";

const storageKey = (hostId: string) =>
  `vibepad.workspace-ui.v1.${encodeURIComponent(hostId)}`;

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

export const workspaceUiStorage: WorkspaceUiStorage = {
  read(hostId) {
    return Promise.resolve(
      decodeWorkspaceUiSnapshot(readJson(storageKey(hostId)))
    );
  },
  write(hostId, snapshot: WorkspaceUiSnapshot) {
    const storage = browserStorage();
    if (!storage) {
      return Promise.reject(new Error("Browser storage is unavailable"));
    }
    storage.setItem(storageKey(hostId), JSON.stringify(snapshot));
    return Promise.resolve();
  },
};
