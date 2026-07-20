import type { HostCredential } from "./host-credential";
import type { HostCredentialStore } from "./host-credential-store";

const sessionCredentials = new Map<string, HostCredential>();

export const hostCredentialStore: HostCredentialStore = {
  delete(hostId) {
    sessionCredentials.delete(hostId);
    return Promise.resolve();
  },
  read(hostId) {
    return Promise.resolve(sessionCredentials.get(hostId));
  },
  write(hostId, credential) {
    sessionCredentials.set(hostId, credential);
    return Promise.resolve();
  },
};
