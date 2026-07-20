import { deleteItemAsync, getItemAsync, setItemAsync } from "expo-secure-store";

import {
  decodeHostCredential,
  type HostCredential,
  secureHostCredentialKey,
} from "./host-credential";

export interface HostCredentialStore {
  readonly delete: (hostId: string) => Promise<void>;
  readonly read: (hostId: string) => Promise<HostCredential | undefined>;
  readonly write: (hostId: string, credential: HostCredential) => Promise<void>;
}

export const hostCredentialStore: HostCredentialStore = {
  async delete(hostId) {
    await deleteItemAsync(secureHostCredentialKey(hostId));
  },
  async read(hostId) {
    const stored = await getItemAsync(secureHostCredentialKey(hostId));
    if (!stored) {
      return;
    }
    try {
      return decodeHostCredential(JSON.parse(stored) as unknown);
    } catch {
      // Invalid secure data is treated as a missing credential.
    }
  },
  async write(hostId, credential) {
    await setItemAsync(
      secureHostCredentialKey(hostId),
      JSON.stringify(credential)
    );
  },
};
