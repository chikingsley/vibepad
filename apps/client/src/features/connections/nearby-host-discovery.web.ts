import type { NearbyHost } from "./nearby-host";

export interface NearbyHostDiscoveryState {
  readonly errorMessage?: string;
  readonly hosts: readonly NearbyHost[];
}

export const subscribeToNearbyHosts = (
  listener: (state: NearbyHostDiscoveryState) => void
) => {
  listener({ hosts: [] });
  return () => undefined;
};
