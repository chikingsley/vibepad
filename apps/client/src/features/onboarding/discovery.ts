import type {
  DiscoveryState,
  NearbyComputer,
} from "@vibepad/protocol/onboarding";

import type { NearbyHostDiscoveryState } from "@/features/connections/nearby-host-discovery";

/**
 * How long Screen 3 keeps reporting "searching" with zero results before the
 * discovery state becomes terminal "empty".
 */
export const discoverySearchWindowMs = 10_000;

const permissionErrorPattern =
  /permission|denied|not authorized|local.network/i;

/**
 * Maps a raw nearby-host snapshot onto the typed onboarding discovery state.
 * Permission denials stay "permission-required"; every other discovery failure
 * is a real "error". Zero results stay "searching" until the bounded search
 * window has elapsed, then become terminal "empty".
 */
export const discoveryStateFromSnapshot = (
  snapshot: NearbyHostDiscoveryState,
  options: { readonly searchWindowElapsed: boolean }
): DiscoveryState => {
  if (snapshot.errorMessage) {
    return permissionErrorPattern.test(snapshot.errorMessage)
      ? { message: snapshot.errorMessage, status: "permission-required" }
      : { message: snapshot.errorMessage, status: "error" };
  }
  if (snapshot.hosts.length === 0) {
    return options.searchWindowElapsed
      ? { status: "empty" }
      : { computers: [], status: "searching" };
  }
  return {
    computers: snapshot.hosts.map((nearbyHost) => ({
      endpoints: [...nearbyHost.endpoints],
      id: nearbyHost.id,
      name: nearbyHost.name,
    })),
    status: "ready",
  };
};

/**
 * Resolves which discovered computer a selection refers to. Without an id the
 * selection is only unambiguous when exactly one computer was found; with an
 * id it must match a discovered computer.
 */
export const selectedDiscoveryComputer = (
  discovery: DiscoveryState,
  computerId?: string
): NearbyComputer | undefined => {
  if (discovery.status !== "ready") {
    return;
  }
  if (computerId === undefined) {
    return discovery.computers.length === 1
      ? discovery.computers[0]
      : undefined;
  }
  return discovery.computers.find((computer) => computer.id === computerId);
};
