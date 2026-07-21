import Storage from "expo-sqlite/kv-store";

import {
  decodeWorkspaceUiSnapshot,
  type WorkspaceUiSnapshot,
} from "@/features/workspace/state/workspace-ui-persistence";

const storageKey = (hostId: string) =>
  `vibepad.workspace-ui.v1.${encodeURIComponent(hostId)}`;

const parseJson = (value: string | null): unknown => {
  if (!value) {
    return;
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    // Invalid persisted data is treated as absent.
  }
};

export interface WorkspaceUiStorage {
  readonly read: (hostId: string) => Promise<WorkspaceUiSnapshot | undefined>;
  readonly write: (
    hostId: string,
    snapshot: WorkspaceUiSnapshot
  ) => Promise<void>;
}

export const workspaceUiStorage: WorkspaceUiStorage = {
  async read(hostId) {
    return decodeWorkspaceUiSnapshot(
      parseJson(await Storage.getItem(storageKey(hostId)))
    );
  },
  async write(hostId, snapshot) {
    await Storage.setItem(storageKey(hostId), JSON.stringify(snapshot));
  },
};
