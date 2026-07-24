import {
  addEventListener,
  startSearch,
  stopSearch,
} from "@inthepocket/react-native-service-discovery";

import { type NearbyHost, nearbyHostFromService } from "./nearby-host";

export interface NearbyHostDiscoveryState {
  readonly errorMessage?: string;
  readonly hosts: readonly NearbyHost[];
}

export const subscribeToNearbyHosts = (
  listener: (state: NearbyHostDiscoveryState) => void
) => {
  const hosts = new Map<string, NearbyHost>();
  const publish = () => listener({ hosts: [...hosts.values()] });
  const found = addEventListener("serviceFound", (service) => {
    const host = nearbyHostFromService(service);
    if (host) {
      hosts.set(host.id, host);
      publish();
    }
  });
  const lost = addEventListener("serviceLost", (service) => {
    const { hostid } = service.txt;
    if (hostid && hosts.delete(hostid)) {
      publish();
    }
  });
  startSearch("vibepad").catch((error: unknown) => {
    listener({
      errorMessage:
        error instanceof Error ? error.message : "Nearby discovery failed",
      hosts: [...hosts.values()],
    });
  });

  return () => {
    found.remove();
    lost.remove();
    stopSearch("vibepad").catch(() => undefined);
  };
};
