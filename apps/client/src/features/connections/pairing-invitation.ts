import type { AppSettings } from "@vibepad/protocol/settings";
import { createHostProfile } from "@vibepad/protocol/settings";

export const connectionsWithPairedHost = (
  connections: AppSettings["connections"],
  paired: { readonly hostId: string; readonly hostName: string },
  endpoint: string
): AppSettings["connections"] => {
  const existing = connections.hosts.find(
    (candidate) => candidate.id === paired.hostId
  );
  const profile = createHostProfile({
    id: paired.hostId,
    name: paired.hostName,
    url: endpoint,
  });
  return {
    activeHostId: paired.hostId,
    hosts: [
      ...connections.hosts.filter(
        (candidate) => candidate.id !== paired.hostId
      ),
      existing
        ? { ...profile, automaticStart: existing.automaticStart }
        : profile,
    ],
  };
};
