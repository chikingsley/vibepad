import { useValue } from "@legendapp/state/react";
import type { ComputerConnectionStatus } from "@vibepad/protocol/onboarding";
import type { HostProfile } from "@vibepad/protocol/settings";

import { createComputerConnectionRegistry } from "./computer-connection-registry";

export const computerConnectionRegistry = createComputerConnectionRegistry();

export const reportComputerConnection = (
  hostId: string,
  status: ComputerConnectionStatus,
  errorMessage?: string
) => {
  const previous = computerConnectionRegistry.state$.byHostId[hostId]?.peek();
  computerConnectionRegistry.set({
    errorMessage,
    hostId,
    lastConnectedAt:
      status === "connected" ? Date.now() : (previous?.lastConnectedAt ?? null),
    status,
  });
};

export const reconcileComputerRecords = (hosts: readonly HostProfile[]) => {
  const savedHostIds = new Set(hosts.map((host) => host.id));
  for (const hostId of Object.keys(
    computerConnectionRegistry.state$.byHostId.peek()
  )) {
    if (!savedHostIds.has(hostId)) {
      computerConnectionRegistry.remove(hostId);
    }
  }
};

export const useComputerConnectionStatus = (hostId: string) =>
  useValue(
    () => computerConnectionRegistry.state$.byHostId[hostId]?.get()?.status
  );

const statusDotClasses: Record<ComputerConnectionStatus, string> = {
  attention: "bg-amber-400",
  connected: "bg-emerald-400",
  connecting: "bg-sky-400",
  offline: "bg-red-400",
  "starting-host": "bg-sky-400",
};

export const computerStatusDotClass = (
  status: ComputerConnectionStatus | undefined
) => (status ? statusDotClasses[status] : "bg-muted-foreground/60");

export const computerStatusLabel = (
  status: ComputerConnectionStatus | undefined
) => (status === "starting-host" ? "starting host" : status);
