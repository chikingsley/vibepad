import type { AppSettings, HostProfile } from "@vibepad/protocol/settings";

import type { SettingsPersistenceState } from "@/features/settings/state/settings-store";

export type ConnectionEntryState =
  | { readonly status: "loading" }
  | { readonly errorMessage?: string; readonly status: "activation" }
  | { readonly host: HostProfile; readonly status: "workspace" };

export const resolveConnectionEntryState = (
  connections: AppSettings["connections"],
  persistenceState: SettingsPersistenceState,
  errorMessage?: string
): ConnectionEntryState => {
  if (persistenceState === "loading") {
    return { status: "loading" };
  }
  const host = connections.hosts.find(
    (candidate) => candidate.id === connections.activeHostId
  );
  if (host) {
    return { host, status: "workspace" };
  }
  return {
    ...(persistenceState === "error" && errorMessage ? { errorMessage } : {}),
    status: "activation",
  };
};
